import { int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const adminAccounts = mysqlTable("admin_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  username: varchar("username", { length: 80 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const adminSessions = mysqlTable("admin_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const wallets = mysqlTable("wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  currency: varchar("currency", { length: 3 }).default("IDR").notNull(),
  balanceMinor: int("balanceMinor").default(0).notNull(),
  version: int("version").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const walletTransactions = mysqlTable("wallet_transactions", {
  id: int("id").autoincrement().primaryKey(),
  walletId: int("walletId").notNull(),
  userId: int("userId").notNull(),
  reference: varchar("reference", { length: 80 }).notNull().unique(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  type: mysqlEnum("type", ["deposit", "debit", "refund", "adjustment"]).notNull(),
  direction: mysqlEnum("direction", ["credit", "debit"]).notNull(),
  amountMinor: int("amountMinor").notNull(),
  balanceAfterMinor: int("balanceAfterMinor").notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ idemIdx: uniqueIndex("wallet_tx_idem_idx").on(table.userId, table.idempotencyKey) }));

export const deposits = mysqlTable("deposits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  reference: varchar("reference", { length: 80 }).notNull().unique(),
  amountMinor: int("amountMinor").notNull(),
  bonusMinor: int("bonusMinor").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "paid", "expired", "failed"]).default("pending").notNull(),
  provider: varchar("provider", { length: 40 }).default("qris").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  paidAt: timestamp("paidAt"),
});

export const refunds = mysqlTable("refunds", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  activationId: int("activationId").notNull(),
  reference: varchar("reference", { length: 80 }).notNull().unique(),
  amountMinor: int("amountMinor").notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["pending", "completed", "failed"]).default("completed").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  apiUrl: varchar("apiUrl", { length: 255 }),
  apiKeyEncrypted: text("apiKeyEncrypted"),
  priority: int("priority").default(100).notNull(),
  timeoutMs: int("timeoutMs").default(10000).notNull(),
  status: mysqlEnum("status", ["active", "inactive", "degraded"]).default("active").notNull(),
  successRateBps: int("successRateBps").default(9900).notNull(),
  avgResponseMs: int("avgResponseMs").default(800).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId").notNull(),
  code: varchar("code", { length: 60 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  countryCode: varchar("countryCode", { length: 8 }).notNull(),
  countryName: varchar("countryName", { length: 80 }).notNull(),
  operator: varchar("operator", { length: 60 }),
  supplierPriceMinor: int("supplierPriceMinor").notNull(),
  salePriceMinor: int("salePriceMinor").notNull(),
  resellerPriceMinor: int("resellerPriceMinor").notNull(),
  vipPriceMinor: int("vipPriceMinor").notNull(),
  apiPriceMinor: int("apiPriceMinor").notNull(),
  stock: int("stock").default(0).notNull(),
  availability: mysqlEnum("availability", ["available", "limited", "offline"]).default("available").notNull(),
  successRateBps: int("successRateBps").default(9800).notNull(),
  responseTimeMs: int("responseTimeMs").default(1200).notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({ serviceIdx: uniqueIndex("services_supplier_code_country_idx").on(table.supplierId, table.code, table.countryCode) }));

export const activations = mysqlTable("activations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  serviceId: int("serviceId").notNull(),
  supplierId: int("supplierId").notNull(),
  activationId: varchar("activationId", { length: 80 }).notNull().unique(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  supplierActivationId: varchar("supplierActivationId", { length: 120 }),
  phoneMasked: varchar("phoneMasked", { length: 40 }),
  otpCode: varchar("otpCode", { length: 20 }),
  amountMinor: int("amountMinor").notNull(),
  state: mysqlEnum("state", ["CREATED", "RESERVED", "PENDING", "OTP_RECEIVED", "SUCCESS", "CANCELLED", "TIMEOUT", "REFUND"]).default("CREATED").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  expiresAt: timestamp("expiresAt"),
}, (table) => ({ activationIdemIdx: uniqueIndex("activations_user_idem_idx").on(table.userId, table.idempotencyKey) }));

export const activationEvents = mysqlTable("activation_events", {
  id: int("id").autoincrement().primaryKey(),
  activationId: int("activationId").notNull(),
  fromState: varchar("fromState", { length: 30 }),
  toState: varchar("toState", { length: 30 }).notNull(),
  eventId: varchar("eventId", { length: 80 }).notNull().unique(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  keyPrefix: varchar("keyPrefix", { length: 20 }).notNull(),
  secretHash: varchar("secretHash", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["active", "inactive", "revoked"]).default("active").notNull(),
  rateLimitPerMinute: int("rateLimitPerMinute").default(60).notNull(),
  ipWhitelist: text("ipWhitelist"),
  lastUsedAt: timestamp("lastUsedAt"),
  requestCount: int("requestCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
});

export const webhookEndpoints = mysqlTable("webhook_endpoints", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  secretHash: varchar("secretHash", { length: 255 }).notNull(),
  events: text("events").notNull(),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  lastDeliveryAt: timestamp("lastDeliveryAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const webhookDeliveries = mysqlTable("webhook_deliveries", {
  id: int("id").autoincrement().primaryKey(),
  endpointId: int("endpointId").notNull(),
  eventId: varchar("eventId", { length: 80 }).notNull().unique(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  payload: text("payload").notNull(),
  status: mysqlEnum("status", ["pending", "delivered", "failed"]).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  responseCode: int("responseCode"),
  lastError: text("lastError"),
  nextRetryAt: timestamp("nextRetryAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  deliveredAt: timestamp("deliveredAt"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ActivationState = typeof activations.$inferSelect.state;
export type AdminAccount = typeof adminAccounts.$inferSelect;
export type AdminSession = typeof adminSessions.$inferSelect;
