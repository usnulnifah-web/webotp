import { randomBytes, createHash } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb, getWallet, getRecentWalletTransactions, getUserApiKeys, getUserWebhooks, getCatalog, getPublicStats, getUserActivations, countUserActivations, recordActivationEvent, ensureCatalog, hasAdminAccount, createAdminAccount, loginAdmin, deleteAdminSession, getAdminLoginLock, recordAdminLoginFailure, clearAdminLoginFailures, changeAdminPassword, deleteAdminSessions, writeAuditLog } from "./db";
import { auditLogs, apiKeys, activations, deposits, refunds, services, suppliers, walletTransactions, wallets, webhookDeliveries, webhookEndpoints } from "../drizzle/schema";

const jsonOk = <T>(data: T, message = "Success") => ({ success: true, data, message, error: null });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const money = (value: number) => Math.round(value);
const clientIp = (req: { ip?: string; headers: Record<string, string | string[] | undefined> }) => req.ip || String(req.headers["x-forwarded-for"] ?? "unknown").split(",")[0].trim();
export const adminPasswordSchema = z.string().regex(/^\d{6}$/);
export const adminSetupInputSchema = z.object({ username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9_.-]+$/), password: adminPasswordSchema, confirmPassword: z.string() });

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => { const cookieOptions = getSessionCookieOptions(ctx.req); const token = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME]; await deleteAdminSession(token); await writeAuditLog("admin.logout", { userId: ctx.user?.id, ipAddress: clientIp(ctx.req) }); ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 }); return { success: true } as const; }),
  }),
  setup: router({
    status: publicProcedure.query(async ({ ctx }) => jsonOk({ configured: await hasAdminAccount(), authenticated: Boolean(ctx.user), user: ctx.user ? { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role } : null })),
    createAdmin: publicProcedure.input(adminSetupInputSchema).mutation(async ({ ctx, input }) => {
      if (input.password !== input.confirmPassword) throw new Error("Passwords do not match");
      const account = await createAdminAccount(input.username, input.password);
      const session = await loginAdmin(input.username, input.password);
      if (!session) throw new Error("Could not start admin session");
      await writeAuditLog("admin.setup_completed", { userId: account.userId, ipAddress: clientIp(ctx.req), metadata: { username: account.username } });
      ctx.res.cookie(COOKIE_NAME, session.token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return jsonOk({ username: account.username }, "Admin account created");
    }),
    login: publicProcedure.input(z.object({ username: z.string().trim().min(1).max(80), password: adminPasswordSchema })).mutation(async ({ ctx, input }) => {
      if (!(await hasAdminAccount())) throw new Error("Admin setup is required");
      const ipAddress = clientIp(ctx.req);
      const lockedSeconds = await getAdminLoginLock(input.username, ipAddress);
      if (lockedSeconds > 0) throw new Error(`Too many attempts. Try again in ${Math.ceil(lockedSeconds / 60)} minute(s)`);
      const session = await loginAdmin(input.username, input.password);
      if (!session) { await recordAdminLoginFailure(input.username, ipAddress); await writeAuditLog("admin.login_failed", { ipAddress, metadata: { username: input.username } }); throw new Error("Invalid username or 6-digit password"); }
      await clearAdminLoginFailures(input.username, ipAddress);
      await writeAuditLog("admin.login_success", { userId: session.userId, ipAddress });
      ctx.res.cookie(COOKIE_NAME, session.token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return jsonOk({ username: session.username }, "Login successful");
    }),
  }),
  public: router({
    stats: publicProcedure.query(async () => { if (!(await hasAdminAccount())) throw new Error("Admin setup required"); return jsonOk(await getPublicStats()); }),
    catalog: publicProcedure.query(async () => { if (!(await hasAdminAccount())) throw new Error("Admin setup required"); return jsonOk(await getCatalog()); }),
  }),
  wallet: router({
    createDeposit: protectedProcedure.input(z.object({ amountMinor: z.number().int().min(10000).max(10000000) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const reference = `dep_${randomBytes(10).toString("hex")}`;
      await db.insert(deposits).values({ userId: ctx.user.id, reference, amountMinor: input.amountMinor, bonusMinor: 0, status: "pending", provider: "qris" });
      return jsonOk({ reference, amountMinor: input.amountMinor, status: "pending", provider: "qris", next: "Complete payment with your configured QRIS provider, then confirm the provider webhook." }, "Deposit created");
    }),
  }),
  dashboard: router({
    overview: protectedProcedure.query(async ({ ctx }) => {
      const [wallet, activationsList, transactions, count] = await Promise.all([getWallet(ctx.user.id), getUserActivations(ctx.user.id), getRecentWalletTransactions(ctx.user.id), countUserActivations(ctx.user.id)]);
      return jsonOk({ wallet, activations: activationsList, transactions, totalActivations: count, activeActivations: activationsList.filter(a => ["CREATED", "RESERVED", "PENDING", "OTP_RECEIVED"].includes(a.state)).length });
    }),
    purchase: protectedProcedure.input(z.object({ serviceId: z.number().int().positive(), idempotencyKey: z.string().min(12).max(128) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const existing = await db.select().from(activations).where(and(eq(activations.userId, ctx.user.id), eq(activations.idempotencyKey, input.idempotencyKey))).limit(1);
      if (existing[0]) return jsonOk(existing[0], "Idempotent replay");
      const result = await db.transaction(async tx => {
        const serviceRows = await tx.select().from(services).where(and(eq(services.id, input.serviceId), eq(services.status, "active"))).limit(1);
        const service = serviceRows[0]; if (!service || service.stock < 1 || service.availability === "offline") throw new Error("Service is unavailable");
        const walletRows = await tx.select().from(wallets).where(eq(wallets.userId, ctx.user.id)).limit(1);
        const wallet = walletRows[0] ?? (await tx.insert(wallets).values({ userId: ctx.user.id }).then(async () => (await tx.select().from(wallets).where(eq(wallets.userId, ctx.user.id)).limit(1))[0]));
        if (!wallet || wallet.balanceMinor < service.salePriceMinor) throw new Error("Insufficient balance");
        const stockUpdate = await tx.update(services).set({ stock: sql`${services.stock} - 1` }).where(and(eq(services.id, service.id), sql`${services.stock} > 0`));
        if ((stockUpdate as any).affectedRows !== 1) throw new Error("Stock changed; please retry");
        const activationId = `act_${randomBytes(10).toString("hex")}`;
        const ref = `wtx_${randomBytes(10).toString("hex")}`;
        const after = wallet.balanceMinor - service.salePriceMinor;
        const walletUpdate = await tx.update(wallets).set({ balanceMinor: after, version: sql`${wallets.version} + 1` }).where(and(eq(wallets.id, wallet.id), eq(wallets.version, wallet.version)));
        if ((walletUpdate as any).affectedRows !== 1) throw new Error("Wallet changed; please retry");
        await tx.insert(walletTransactions).values({ walletId: wallet.id, userId: ctx.user.id, reference: ref, idempotencyKey: input.idempotencyKey, type: "debit", direction: "debit", amountMinor: service.salePriceMinor, balanceAfterMinor: after, description: `Activation ${activationId}`, metadata: JSON.stringify({ serviceId: service.id }) });
        const inserted = await tx.insert(activations).values({ userId: ctx.user.id, serviceId: service.id, supplierId: service.supplierId, activationId, idempotencyKey: input.idempotencyKey, supplierActivationId: `supplier_${randomBytes(8).toString("hex")}`, phoneMasked: "+62 •••• •••• 42", amountMinor: service.salePriceMinor, state: "RESERVED", expiresAt: new Date(Date.now() + 20 * 60 * 1000) });
        const activationDbId = Number((inserted as any).insertId ?? 0);
        await tx.update(activations).set({ state: "PENDING" }).where(eq(activations.id, activationDbId));
        return { activationId, service: service.name, country: service.countryName, amountMinor: service.salePriceMinor, state: "PENDING", ledgerReference: ref, insertId: activationDbId };
      });
      if (result.insertId) {
        await recordActivationEvent(result.insertId, "CREATED", "RESERVED", { idempotencyKey: input.idempotencyKey });
        await recordActivationEvent(result.insertId, "RESERVED", "PENDING", { idempotencyKey: input.idempotencyKey });
      }
      return jsonOk(result, "Activation created");
    }),
  }),
  apiKeys: router({
    list: protectedProcedure.query(async ({ ctx }) => jsonOk(await getUserApiKeys(ctx.user.id))),
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(100), rateLimitPerMinute: z.number().int().min(1).max(10000).default(60), ipWhitelist: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const secret = `wotp_${randomBytes(28).toString("base64url")}`; const prefix = secret.slice(0, 12);
      await db.insert(apiKeys).values({ userId: ctx.user.id, name: input.name, keyPrefix: prefix, secretHash: hash(secret), rateLimitPerMinute: input.rateLimitPerMinute, ipWhitelist: input.ipWhitelist ?? null });
      return jsonOk({ secret, keyPrefix: prefix, warning: "Secret ditampilkan satu kali. Simpan di password manager." }, "API key created");
    }),
    revoke: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(apiKeys).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id))); return jsonOk(null, "API key revoked"); }),
    regenerate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const secret = `wotp_${randomBytes(28).toString("base64url")}`; const prefix = secret.slice(0, 12); await db.update(apiKeys).set({ keyPrefix: prefix, secretHash: hash(secret), status: "active", revokedAt: null }).where(and(eq(apiKeys.id, input.id), eq(apiKeys.userId, ctx.user.id))); return jsonOk({ secret, keyPrefix: prefix, warning: "Secret ditampilkan satu kali." }, "API key regenerated"); }),
  }),
  webhooks: router({
    list: protectedProcedure.query(async ({ ctx }) => jsonOk(await getUserWebhooks(ctx.user.id))),
    create: protectedProcedure.input(z.object({ url: z.string().url(), events: z.array(z.string()).min(1) })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const secret = `whsec_${randomBytes(24).toString("base64url")}`; await db.insert(webhookEndpoints).values({ userId: ctx.user.id, url: input.url, secretHash: hash(secret), events: JSON.stringify(input.events) }); return jsonOk({ secret, warning: "Webhook secret ditampilkan satu kali." }, "Webhook created"); }),
    test: protectedProcedure.input(z.object({ endpointId: z.number().int().positive() })).mutation(async ({ ctx, input }) => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const endpoint = (await db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.id, input.endpointId), eq(webhookEndpoints.userId, ctx.user.id))).limit(1))[0]; if (!endpoint) throw new Error("Webhook not found"); const eventId = `evt_${randomBytes(10).toString("hex")}`; const payload = JSON.stringify({ event_id: eventId, event: "webhook.test", timestamp: new Date().toISOString(), data: { endpointId: endpoint.id } }); await db.insert(webhookDeliveries).values({ endpointId: endpoint.id, eventId, eventType: "webhook.test", payload, status: "pending", attempts: 0 }); return jsonOk({ eventId, status: "queued", signature: hash(`${eventId}.${payload}`) }, "Webhook test queued"); }),
  }),
  admin: router({
    overview: adminProcedure.query(async () => jsonOk({ router: "SupplierRouter active", supportedStates: ["CREATED", "RESERVED", "PENDING", "OTP_RECEIVED", "SUCCESS", "CANCELLED", "TIMEOUT", "REFUND"], pricing: "Database-driven", ledger: "Enabled" })),
    changePassword: adminProcedure.input(z.object({ currentPassword: adminPasswordSchema, newPassword: adminPasswordSchema, confirmPassword: z.string() })).mutation(async ({ ctx, input }) => {
      if (input.newPassword !== input.confirmPassword) throw new Error("Passwords do not match");
      const changed = await changeAdminPassword(ctx.user.id, input.currentPassword, input.newPassword);
      if (!changed) { await writeAuditLog("admin.password_change_failed", { userId: ctx.user.id, ipAddress: clientIp(ctx.req) }); throw new Error("Current password is invalid"); }
      await writeAuditLog("admin.password_changed", { userId: ctx.user.id, ipAddress: clientIp(ctx.req) });
      return jsonOk(null, "Password changed. Please login again.");
    }),
    logoutAllSessions: adminProcedure.mutation(async ({ ctx }) => { await deleteAdminSessions(ctx.user.id); await writeAuditLog("admin.sessions_revoked", { userId: ctx.user.id, ipAddress: clientIp(ctx.req) }); return jsonOk(null, "All sessions revoked"); }),
    auditLog: adminProcedure.query(async () => { const db = await getDb(); if (!db) throw new Error("Database unavailable"); return jsonOk(await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100)); }),
  }),
});
export type AppRouter = typeof appRouter;
