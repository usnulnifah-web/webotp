import type { Express, Request, Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import nodemailer from "nodemailer";
import { randomBytes } from "node:crypto";
import { authRateLimits, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { generateOtp, hashOtp, hashPassword, hashRateLimitKey, normalizeEmail, safeEqualHex, verifyPassword } from "./localAuthSecurity";

const OTP_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const genericAuthReply = { success: true, message: "Jika detail cocok, langkah berikutnya akan dikirim ke email tersebut." };
const registerSchema = z.object({ name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320), password: z.string().min(12).max(128) });
const verifySchema = z.object({ email: z.string().trim().email().max(320), otp: z.string().regex(/^\d{6}$/) });
const loginSchema = z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(128) });
const dummyPasswordHash = hashPassword("timing-equalization-dummy-password");

function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ success: false, message });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: (error?: unknown) => void) => {
    void handler(req, res).catch(next);
  };
}

function smtpTransport() {
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_APP_PASSWORD;
  if (!user || !password) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  return nodemailer.createTransport({ host, port, secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000, auth: { user, pass: password } });
}

function sessionConfigured() {
  return Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32 && process.env.VITE_APP_ID);
}

function requestAddress(req: Request) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

async function consumeRateLimit(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, namespace: string, value: string, limit: number) {
  const key = hashRateLimitKey(namespace, value);
  const now = new Date();
  const cutoff = new Date(now.getTime() - RATE_WINDOW_MS);
  if (Math.random() < 0.02) await db.delete(authRateLimits).where(sql`${authRateLimits.windowStartedAt} < ${new Date(now.getTime() - 24 * 60 * 60 * 1000)}`);
  await db.insert(authRateLimits).values({ key, attempts: 1, windowStartedAt: now }).onDuplicateKeyUpdate({ set: {
    attempts: sql`IF(${authRateLimits.windowStartedAt} <= ${cutoff}, 1, ${authRateLimits.attempts} + 1)`,
    windowStartedAt: sql`IF(${authRateLimits.windowStartedAt} <= ${cutoff}, ${now}, ${authRateLimits.windowStartedAt})`,
  } });
  const row = (await db.select().from(authRateLimits).where(eq(authRateLimits.key, key)).limit(1))[0];
  return Boolean(row && row.attempts <= limit);
}

function authHeaders(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  const origin = req.headers.origin;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0]?.trim();
  const expectedOrigin = `${forwardedProto || req.protocol}://${req.get("host")}`;
  if (origin && origin !== expectedOrigin) return false;
  return true;
}

export function registerLocalAuthRoutes(app: Express) {
  app.post("/api/auth/register", asyncRoute(async (req, res) => {
    if (!authHeaders(req, res)) return jsonError(res, 403, "Cross-origin request rejected");
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, "Nama, email, atau password tidak memenuhi syarat. Gunakan password 12–128 karakter.");
    if (!sessionConfigured()) return jsonError(res, 503, "Session auth belum dikonfigurasi oleh administrator.");
    const db = await getDb(); if (!db) return jsonError(res, 503, "Layanan autentikasi belum tersedia.");
    const email = normalizeEmail(parsed.data.email);
    if (!(await consumeRateLimit(db, "signup-email", email, 3)) || !(await consumeRateLimit(db, "signup-ip", requestAddress(req), 10))) return jsonError(res, 429, "Terlalu banyak percobaan. Coba lagi beberapa menit.");
    const mailer = smtpTransport();
    if (!mailer) return jsonError(res, 503, "Verifikasi email belum aktif. Administrator perlu mengatur kredensial Gmail SMTP.");
    try {
      const localAccounts = await db.select().from(users).where(eq(users.localEmail, email)).limit(2);
      const linkedOAuthUsers = localAccounts.length ? [] : await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(2);
      const existing = localAccounts.length ? localAccounts : linkedOAuthUsers;
      if (existing.length > 1 || existing[0]?.passwordHash) return res.status(202).json(genericAuthReply);
      const otp = generateOtp();
      const otpHash = hashOtp(email, otp);
      const passwordHash = await hashPassword(parsed.data.password);
      const expiresAt = new Date(Date.now() + OTP_TTL_MS);
      if (existing[0]) {
        await db.update(users).set({ localEmail: email, pendingName: parsed.data.name, pendingPasswordHash: passwordHash, emailOtpHash: otpHash, emailOtpExpiresAt: expiresAt, emailOtpAttempts: 0 }).where(eq(users.id, existing[0].id));
      } else {
        await db.insert(users).values({ openId: `local_${randomBytes(20).toString("hex")}`, email, localEmail: email, pendingName: parsed.data.name, pendingPasswordHash: passwordHash, emailOtpHash: otpHash, emailOtpExpiresAt: expiresAt, emailOtpAttempts: 0, loginMethod: "email_password", role: "user" });
      }
      await mailer.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject: "Kode verifikasi WebOTP", text: `Kode verifikasi email WebOTP Anda: ${otp}\nKode berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun. Jika Anda tidak meminta pendaftaran, abaikan email ini.` });
      return res.status(202).json(genericAuthReply);
    } catch (error) {
      console.error("[LocalAuth] Registration/OTP delivery failed", error instanceof Error ? error.name : "unknown error");
      return jsonError(res, 503, "Tidak dapat mengirim email verifikasi saat ini. Coba lagi nanti.");
    }
  }));

  app.post("/api/auth/verify-email", asyncRoute(async (req, res) => {
    if (!authHeaders(req, res)) return jsonError(res, 403, "Cross-origin request rejected");
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, "Kode verifikasi tidak valid.");
    if (!sessionConfigured()) return jsonError(res, 503, "Session auth belum dikonfigurasi oleh administrator.");
    const db = await getDb(); if (!db) return jsonError(res, 503, "Layanan autentikasi belum tersedia.");
    const email = normalizeEmail(parsed.data.email);
    if (!(await consumeRateLimit(db, "verify-email", email, 8)) || !(await consumeRateLimit(db, "verify-ip", requestAddress(req), 24))) return jsonError(res, 429, "Terlalu banyak percobaan kode. Minta kode baru nanti.");
    const found = await db.select().from(users).where(eq(users.localEmail, email)).limit(2);
    const user = found.length === 1 ? found[0] : undefined;
    if (!user?.pendingPasswordHash || !user.emailOtpHash || !user.emailOtpExpiresAt || user.emailOtpExpiresAt.getTime() <= Date.now() || user.emailOtpAttempts >= 5) return jsonError(res, 400, "Kode tidak valid atau sudah kedaluwarsa. Daftar ulang untuk meminta kode baru.");
    if (!safeEqualHex(hashOtp(email, parsed.data.otp), user.emailOtpHash)) {
      await db.update(users).set({ emailOtpAttempts: sql`${users.emailOtpAttempts} + 1` }).where(and(eq(users.id, user.id), eq(users.emailOtpHash, user.emailOtpHash)));
      return jsonError(res, 400, "Kode tidak valid atau sudah kedaluwarsa.");
    }
    const now = new Date();
    const displayName = user.pendingName || user.name || email.split("@")[0];
    const activated = await db.update(users).set({ name: displayName, email, localEmail: email, passwordHash: user.pendingPasswordHash, pendingPasswordHash: null, pendingName: null, emailVerifiedAt: now, emailOtpHash: null, emailOtpExpiresAt: null, emailOtpAttempts: 0, loginMethod: "email_password", lastSignedIn: now }).where(and(eq(users.id, user.id), eq(users.emailOtpHash, user.emailOtpHash), eq(users.emailOtpAttempts, user.emailOtpAttempts)));
    if ((activated as any).affectedRows !== 1) return jsonError(res, 409, "Kode sudah digunakan atau kedaluwarsa. Coba masuk kembali.");
    const sessionToken = await sdk.createSessionToken(user.openId, { expiresInMs: 12 * 60 * 60 * 1000, name: displayName, authSource: "email" });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 12 * 60 * 60 * 1000 });
    return res.json({ success: true, message: "Email terverifikasi dan akun siap digunakan." });
  }));

  app.post("/api/auth/login", asyncRoute(async (req, res) => {
    if (!authHeaders(req, res)) return jsonError(res, 403, "Cross-origin request rejected");
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return jsonError(res, 400, "Email atau password tidak valid.");
    if (!sessionConfigured()) return jsonError(res, 503, "Session auth belum dikonfigurasi oleh administrator.");
    const db = await getDb(); if (!db) return jsonError(res, 503, "Layanan autentikasi belum tersedia.");
    const email = normalizeEmail(parsed.data.email);
    if (!(await consumeRateLimit(db, "login-email", email, 10)) || !(await consumeRateLimit(db, "login-ip", requestAddress(req), 25))) return jsonError(res, 429, "Terlalu banyak percobaan login. Coba lagi beberapa menit.");
    const found = await db.select().from(users).where(eq(users.localEmail, email)).limit(2);
    const user = found.length === 1 ? found[0] : undefined;
    const passwordOkay = await verifyPassword(parsed.data.password, user?.passwordHash || await dummyPasswordHash);
    if (!user?.emailVerifiedAt || !user.passwordHash || !passwordOkay) return jsonError(res, 401, "Email atau password tidak cocok, atau email belum diverifikasi.");
    const now = new Date();
    await db.update(users).set({ lastSignedIn: now }).where(eq(users.id, user.id));
    const sessionToken = await sdk.createSessionToken(user.openId, { expiresInMs: 12 * 60 * 60 * 1000, name: user.name || email, authSource: "email" });
    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: 12 * 60 * 60 * 1000 });
    return res.json({ success: true, message: "Login berhasil." });
  }));
}

export function localAuthConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_APP_PASSWORD && sessionConfigured());
}
