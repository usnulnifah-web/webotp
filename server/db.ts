import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from "./_core/env";
import { users, wallets, walletTransactions, apiKeys, webhookEndpoints, services, suppliers, activations, activationEvents, type InsertUser } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try { _db = drizzle(process.env.DATABASE_URL); } catch { _db = null; }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb(); if (!db || !user.openId) return;
  const values: InsertUser = { openId: user.openId, name: user.name, email: user.email, loginMethod: user.loginMethod, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  if (user.name !== undefined) { values.name = user.name; updateSet.name = user.name; }
  if (user.email !== undefined) { values.email = user.email; updateSet.email = user.email; }
  if (user.loginMethod !== undefined) { values.loginMethod = user.loginMethod; updateSet.loginMethod = user.loginMethod; }
  if (user.openId === ENV.ownerOpenId) { values.role = "admin"; updateSet.role = "admin"; }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}
export async function getUserByOpenId(openId: string) { const db = await getDb(); if (!db) return undefined; const r = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return r[0]; }

export async function ensureWallet(userId: number) {
  const db = await getDb(); if (!db) return null;
  const existing = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(wallets).values({ userId });
  const created = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return created[0] ?? null;
}
export async function getWallet(userId: number) { return ensureWallet(userId); }
export async function getRecentWalletTransactions(userId: number) { const db = await getDb(); if (!db) return []; return db.select().from(walletTransactions).where(eq(walletTransactions.userId, userId)).orderBy(desc(walletTransactions.createdAt)).limit(20); }
export async function getUserApiKeys(userId: number) { const db = await getDb(); if (!db) return []; return db.select({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, status: apiKeys.status, rateLimitPerMinute: apiKeys.rateLimitPerMinute, lastUsedAt: apiKeys.lastUsedAt, requestCount: apiKeys.requestCount, createdAt: apiKeys.createdAt, revokedAt: apiKeys.revokedAt }).from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt)); }
export async function getUserWebhooks(userId: number) { const db = await getDb(); if (!db) return []; return db.select({ id: webhookEndpoints.id, url: webhookEndpoints.url, events: webhookEndpoints.events, status: webhookEndpoints.status, lastDeliveryAt: webhookEndpoints.lastDeliveryAt, createdAt: webhookEndpoints.createdAt }).from(webhookEndpoints).where(eq(webhookEndpoints.userId, userId)).orderBy(desc(webhookEndpoints.createdAt)); }
export async function getCatalog() { const db = await getDb(); if (!db) return []; await ensureCatalog(); return db.select().from(services).where(eq(services.status, "active")).orderBy(desc(services.stock)).limit(100); }
export async function ensureCatalog() {
  const db = await getDb(); if (!db) return;
  const supplier = (await db.select().from(suppliers).limit(1))[0];
  const supplierId = supplier?.id ?? (await db.insert(suppliers).values({ name: "Primary Network", priority: 100, status: "active", successRateBps: 9900, avgResponseMs: 850 }).then(async () => (await db.select().from(suppliers).limit(1))[0]?.id));
  if (!supplierId) return;
  const existing = await db.select().from(services).limit(1);
  if (existing[0]) return;
  await db.insert(services).values([
    { supplierId, code: "whatsapp", name: "WhatsApp", countryCode: "ID", countryName: "Indonesia", operator: "Any", supplierPriceMinor: 900, salePriceMinor: 1500, resellerPriceMinor: 1300, vipPriceMinor: 1200, apiPriceMinor: 1250, stock: 240, availability: "available", successRateBps: 9820, responseTimeMs: 980, status: "active" },
    { supplierId, code: "telegram", name: "Telegram", countryCode: "ID", countryName: "Indonesia", operator: "Any", supplierPriceMinor: 700, salePriceMinor: 1200, resellerPriceMinor: 1050, vipPriceMinor: 980, apiPriceMinor: 1000, stock: 180, availability: "available", successRateBps: 9760, responseTimeMs: 1100, status: "active" },
    { supplierId, code: "google", name: "Google", countryCode: "ID", countryName: "Indonesia", operator: "Any", supplierPriceMinor: 1100, salePriceMinor: 1800, resellerPriceMinor: 1600, vipPriceMinor: 1500, apiPriceMinor: 1550, stock: 96, availability: "limited", successRateBps: 9640, responseTimeMs: 1450, status: "active" },
    { supplierId, code: "instagram", name: "Instagram", countryCode: "ID", countryName: "Indonesia", operator: "Any", supplierPriceMinor: 850, salePriceMinor: 1400, resellerPriceMinor: 1250, vipPriceMinor: 1150, apiPriceMinor: 1200, stock: 125, availability: "available", successRateBps: 9710, responseTimeMs: 1250, status: "active" },
    { supplierId, code: "tiktok", name: "TikTok", countryCode: "ID", countryName: "Indonesia", operator: "Any", supplierPriceMinor: 1000, salePriceMinor: 1650, resellerPriceMinor: 1450, vipPriceMinor: 1350, apiPriceMinor: 1400, stock: 72, availability: "limited", successRateBps: 9580, responseTimeMs: 1500, status: "active" },
  ]);
}
export async function getPublicStats() { const db = await getDb(); if (!db) return { services: 0, countries: 0, suppliers: 0, uptime: "99.95%" }; await ensureCatalog(); const [s, c, p] = await Promise.all([db.select({ count: sql<number>`count(*)` }).from(services).where(eq(services.status, "active")), db.select({ count: sql<number>`count(distinct ${services.countryCode})` }).from(services), db.select({ count: sql<number>`count(*)` }).from(suppliers).where(eq(suppliers.status, "active"))]); return { services: Number(s[0]?.count ?? 0), countries: Number(c[0]?.count ?? 0), suppliers: Number(p[0]?.count ?? 0), uptime: "99.95%" }; }
export async function getUserActivations(userId: number) { const db = await getDb(); if (!db) return []; return db.select().from(activations).where(eq(activations.userId, userId)).orderBy(desc(activations.createdAt)).limit(20); }
export async function countUserActivations(userId: number) { const db = await getDb(); if (!db) return 0; const r = await db.select({ count: sql<number>`count(*)` }).from(activations).where(eq(activations.userId, userId)); return Number(r[0]?.count ?? 0); }
export async function recordActivationEvent(activationId: number, fromState: string | null, toState: string, metadata?: unknown) { const db = await getDb(); if (!db) return; await db.insert(activationEvents).values({ activationId, fromState, toState, eventId: `evt_${crypto.randomUUID()}`, metadata: metadata ? JSON.stringify(metadata) : null }); }
