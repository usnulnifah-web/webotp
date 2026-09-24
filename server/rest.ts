import type { Express, Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { getDb, getCatalog, getWallet, recordActivationEvent } from "./db";
import { apiKeys, activations, services, wallets, walletTransactions, refunds, deposits } from "../drizzle/schema";
import { verifyHmacSha256 } from "./_core/secrets";

const reply = (res: Response, status: number, data: unknown, message = "Success", error: unknown = null) => res.status(status).json({ success: status < 400, data: status < 400 ? data : null, message, error });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
async function authenticate(req: Request, res: Response) {
  const raw = req.header("X-API-Key"); if (!raw) { reply(res, 401, null, "Missing API key", { code: "API_KEY_REQUIRED" }); return null; }
  const db = await getDb(); if (!db) { reply(res, 503, null, "Database unavailable", { code: "DATABASE_UNAVAILABLE" }); return null; }
  const key = (await db.select().from(apiKeys).where(and(eq(apiKeys.secretHash, digest(raw)), eq(apiKeys.status, "active"))).limit(1))[0];
  if (!key) { reply(res, 401, null, "Invalid API key", { code: "INVALID_API_KEY" }); return null; }
  await db.update(apiKeys).set({ lastUsedAt: new Date(), requestCount: key.requestCount + 1 }).where(eq(apiKeys.id, key.id));
  return key;
}

export function registerRestApi(app: Express) {
  app.post("/api/webhooks/payments/qris", async (req, res) => {
    const secret = process.env.QRIS_WEBHOOK_SECRET;
    if (!secret) return reply(res, 503, null, "QRIS webhook is not configured", { code: "PAYMENT_WEBHOOK_NOT_CONFIGURED" });
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || !verifyHmacSha256(rawBody, req.header("x-payment-signature"), secret)) return reply(res, 401, null, "Invalid payment signature", { code: "INVALID_SIGNATURE" });
    const payload = req.body ?? {};
    const eventId = typeof payload.event_id === "string" ? payload.event_id : "";
    const reference = typeof payload.reference === "string" ? payload.reference : "";
    const amountMinor = Number(payload.amountMinor);
    if (!eventId || eventId.length > 120 || !reference || reference.length > 80 || payload.status !== "paid" || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) return reply(res, 400, null, "Expected event_id, reference, status=paid, and positive integer amountMinor", { code: "INVALID_PAYMENT_EVENT" });
    const db = await getDb(); if (!db) return reply(res, 503, null, "Database unavailable", { code: "DATABASE_UNAVAILABLE" });
    try {
      const result = await db.transaction(async tx => {
        const deposit = (await tx.select().from(deposits).where(eq(deposits.reference, reference)).limit(1))[0];
        if (!deposit) throw new Error("DEPOSIT_NOT_FOUND");
        if (deposit.amountMinor !== amountMinor) throw new Error("AMOUNT_MISMATCH");
        if (deposit.status === "paid") return { duplicate: true, reference };
        if (deposit.status !== "pending") throw new Error("DEPOSIT_NOT_PENDING");
        let wallet = (await tx.select().from(wallets).where(eq(wallets.userId, deposit.userId)).limit(1))[0];
        if (!wallet) {
          await tx.insert(wallets).values({ userId: deposit.userId });
          wallet = (await tx.select().from(wallets).where(eq(wallets.userId, deposit.userId)).limit(1))[0];
        }
        if (!wallet) throw new Error("WALLET_NOT_FOUND");
        const markedPaid = await tx.update(deposits).set({ status: "paid", paidAt: new Date() }).where(and(eq(deposits.id, deposit.id), eq(deposits.status, "pending"), eq(deposits.amountMinor, amountMinor)));
        if ((markedPaid as any).affectedRows !== 1) throw new Error("DEPOSIT_ALREADY_PROCESSED");
        const credit = deposit.amountMinor + deposit.bonusMinor;
        const balanceAfterMinor = wallet.balanceMinor + credit;
        const walletUpdate = await tx.update(wallets).set({ balanceMinor: balanceAfterMinor, version: sql`${wallets.version} + 1` }).where(and(eq(wallets.id, wallet.id), eq(wallets.version, wallet.version)));
        if ((walletUpdate as any).affectedRows !== 1) throw new Error("WALLET_CHANGED");
        await tx.insert(walletTransactions).values({ walletId: wallet.id, userId: deposit.userId, reference: `pay_${deposit.reference}`, idempotencyKey: `deposit_${deposit.reference}`, type: "deposit", direction: "credit", amountMinor: credit, balanceAfterMinor, description: `QRIS deposit ${deposit.reference}`, metadata: JSON.stringify({ provider: deposit.provider, providerEventId: eventId }) });
        return { duplicate: false, reference, creditedMinor: credit, balanceAfterMinor };
      });
      return reply(res, 200, result, result.duplicate ? "Payment event already processed" : "Payment confirmed");
    } catch (error) {
      const code = String(error).replace("Error: ", "");
      const mapped: Record<string, [number, string]> = { DEPOSIT_NOT_FOUND: [404, "Deposit not found"], AMOUNT_MISMATCH: [400, "Payment amount does not match deposit"], DEPOSIT_NOT_PENDING: [409, "Deposit is not pending"], DEPOSIT_ALREADY_PROCESSED: [409, "Deposit is already being processed"], WALLET_NOT_FOUND: [500, "Wallet could not be created"], WALLET_CHANGED: [409, "Wallet changed; provider may retry safely"] };
      const [status, message] = mapped[code] ?? [500, "Payment processing failed"];
      return reply(res, status, null, message, { code });
    }
  });
  app.get("/api/v1/services", async (_req, res) => reply(res, 200, await getCatalog()));
  app.get("/api/v1/countries", async (_req, res) => { const catalog = await getCatalog(); reply(res, 200, Array.from(new Map(catalog.map(item => [item.countryCode, { code: item.countryCode, name: item.countryName }])).values())); });
  app.get("/api/v1/prices", async (_req, res) => reply(res, 200, (await getCatalog()).map(item => ({ service: item.code, country: item.countryCode, price: item.apiPriceMinor }))));
  app.get("/api/v1/availability", async (_req, res) => reply(res, 200, (await getCatalog()).map(item => ({ service: item.code, country: item.countryCode, stock: item.stock, availability: item.availability }))));
  app.get("/api/v1/balance", async (req, res) => { const key = await authenticate(req, res); if (!key) return; reply(res, 200, await getWallet(key.userId)); });
  app.get("/api/v1/account", async (req, res) => { const key = await authenticate(req, res); if (!key) return; reply(res, 200, { keyPrefix: key.keyPrefix, rateLimitPerMinute: key.rateLimitPerMinute, requestCount: key.requestCount }); });
  app.get("/api/v1/history", async (req, res) => { const key = await authenticate(req, res); if (!key) return; const db = await getDb(); if (!db) return reply(res, 503, null, "Database unavailable"); reply(res, 200, await db.select().from(activations).where(eq(activations.userId, key.userId)).orderBy(desc(activations.createdAt)).limit(100)); });
  app.get("/api/v1/activation/:id", async (req, res) => { const key = await authenticate(req, res); if (!key) return; const db = await getDb(); if (!db) return reply(res, 503, null, "Database unavailable"); const row = (await db.select().from(activations).where(and(eq(activations.activationId, req.params.id), eq(activations.userId, key.userId))).limit(1))[0]; if (!row) return reply(res, 404, null, "Activation not found", { code: "NOT_FOUND" }); reply(res, 200, row); });
  app.post("/api/v1/number/buy", async (req, res) => { const key = await authenticate(req, res); if (!key) return; const { serviceId, idempotencyKey } = req.body ?? {}; if (!Number.isInteger(serviceId) || typeof idempotencyKey !== "string" || idempotencyKey.length < 12) return reply(res, 400, null, "Invalid request", { code: "VALIDATION_ERROR" }); const db = await getDb(); if (!db) return reply(res, 503, null, "Database unavailable"); const existing = (await db.select().from(activations).where(and(eq(activations.userId, key.userId), eq(activations.idempotencyKey, idempotencyKey))).limit(1))[0]; if (existing) return reply(res, 200, existing, "Idempotent replay"); try { const result = await db.transaction(async tx => { const service = (await tx.select().from(services).where(and(eq(services.id, serviceId), eq(services.status, "active"))).limit(1))[0]; if (!service || service.stock < 1 || service.availability === "offline") throw new Error("SERVICE_UNAVAILABLE"); const w = (await tx.select().from(wallets).where(eq(wallets.userId, key.userId)).limit(1))[0] ?? (await tx.insert(wallets).values({ userId: key.userId }).then(async () => (await tx.select().from(wallets).where(eq(wallets.userId, key.userId)).limit(1))[0])); if (!w || w.balanceMinor < service.apiPriceMinor) throw new Error("INSUFFICIENT_BALANCE"); const stockUpdate = await tx.update(services).set({ stock: sql`${services.stock} - 1` }).where(and(eq(services.id, service.id), sql`${services.stock} > 0`)); if ((stockUpdate as any).affectedRows !== 1) throw new Error("STOCK_CHANGED"); const after = w.balanceMinor - service.apiPriceMinor; const walletUpdate = await tx.update(wallets).set({ balanceMinor: after, version: sql`${wallets.version} + 1` }).where(and(eq(wallets.id, w.id), eq(wallets.version, w.version))); if ((walletUpdate as any).affectedRows !== 1) throw new Error("WALLET_CHANGED"); const activationId = `act_${randomBytes(10).toString("hex")}`; const ledgerReference = `wtx_${randomBytes(10).toString("hex")}`; await tx.insert(walletTransactions).values({ walletId: w.id, userId: key.userId, reference: ledgerReference, idempotencyKey, type: "debit", direction: "debit", amountMinor: service.apiPriceMinor, balanceAfterMinor: after, description: `API activation ${activationId}`, metadata: JSON.stringify({ serviceId: service.id }) }); const inserted = await tx.insert(activations).values({ userId: key.userId, serviceId: service.id, supplierId: service.supplierId, activationId, idempotencyKey, supplierActivationId: `supplier_${randomBytes(8).toString("hex")}`, phoneMasked: "+62 •••• •••• 42", amountMinor: service.apiPriceMinor, state: "RESERVED", expiresAt: new Date(Date.now() + 20 * 60 * 1000) }); const activationDbId = Number((inserted as any).insertId ?? 0); await tx.update(activations).set({ state: "PENDING" }).where(eq(activations.id, activationDbId)); return { activationDbId, activationId, service: service.name, country: service.countryName, amountMinor: service.apiPriceMinor, state: "PENDING", ledgerReference }; }); await recordActivationEvent(result.activationDbId, "CREATED", "RESERVED", { idempotencyKey }); await recordActivationEvent(result.activationDbId, "RESERVED", "PENDING", { idempotencyKey }); return reply(res, 201, result, "Activation created"); } catch (error) { const code = String(error).replace("Error: ", ""); const mapped = code === "INSUFFICIENT_BALANCE" ? [402, "Insufficient balance", "INSUFFICIENT_BALANCE"] : code === "SERVICE_UNAVAILABLE" || code === "STOCK_CHANGED" ? [409, "Service unavailable", code] : code === "WALLET_CHANGED" ? [409, "Wallet changed; retry with same idempotency key", code] : [500, "Purchase failed", "PURCHASE_FAILED"]; return reply(res, mapped[0] as number, null, mapped[1] as string, { code: mapped[2] }); } });
  app.post("/api/v1/activation/:id/cancel", async (req, res) => { const key = await authenticate(req, res); if (!key) return; const db = await getDb(); if (!db) return reply(res, 503, null, "Database unavailable"); const row = (await db.select().from(activations).where(and(eq(activations.activationId, req.params.id), eq(activations.userId, key.userId))).limit(1))[0]; if (!row) return reply(res, 404, null, "Activation not found", { code: "NOT_FOUND" }); if (!["PENDING", "RESERVED"].includes(row.state)) return reply(res, 409, null, "Activation cannot be cancelled in current state", { code: "INVALID_STATE" });
    const result = await db.transaction(async tx => { const w = (await tx.select().from(wallets).where(eq(wallets.userId, key.userId)).limit(1))[0]; if (!w) throw new Error("Wallet not found"); const after = w.balanceMinor + row.amountMinor; const walletUpdate = await tx.update(wallets).set({ balanceMinor: after, version: sql`${wallets.version} + 1` }).where(and(eq(wallets.id, w.id), eq(wallets.version, w.version))); if ((walletUpdate as any).affectedRows !== 1) throw new Error("Wallet changed; retry cancellation"); const ref = `refund_${randomBytes(10).toString("hex")}`; await tx.update(activations).set({ state: "CANCELLED" }).where(and(eq(activations.id, row.id), eq(activations.state, "PENDING"))); await tx.update(activations).set({ state: "REFUND" }).where(eq(activations.id, row.id)); await tx.insert(refunds).values({ userId: key.userId, activationId: row.id, reference: ref, amountMinor: row.amountMinor, reason: "Customer cancellation" }); await tx.insert(walletTransactions).values({ walletId: w.id, userId: key.userId, reference: ref, type: "refund", direction: "credit", amountMinor: row.amountMinor, balanceAfterMinor: after, description: `Refund ${row.activationId}`, metadata: JSON.stringify({ activationId: row.activationId }) }); return { ...row, state: "REFUND", refundReference: ref, balanceAfterMinor: after }; }); await recordActivationEvent(row.id, row.state, "CANCELLED", { reason: "customer" }); await recordActivationEvent(row.id, "CANCELLED", "REFUND", { amountMinor: row.amountMinor }); reply(res, 200, result, "Activation cancelled and refunded"); });
}
