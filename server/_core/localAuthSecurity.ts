import { createHmac, randomInt, randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_BYTES = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, length: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, derived) => error ? reject(error) : resolve(derived));
  });
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await deriveKey(password, salt, SCRYPT_BYTES, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAX_MEMORY });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string | null | undefined) {
  if (!encoded) return false;
  const [algorithm, n, r, p, saltText, hashText] = encoded.split("$");
  const N = Number(n), R = Number(r), P = Number(p);
  if (algorithm !== "scrypt" || !Number.isInteger(N) || N < 16384 || N > 65536 || !Number.isInteger(R) || R < 1 || R > 16 || !Number.isInteger(P) || P < 1 || P > 4 || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const actual = await deriveKey(password, Buffer.from(saltText, "base64url"), expected.length, { N, r: R, p: P, maxmem: SCRYPT_MAX_MEMORY });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch { return false; }
}

export function generateOtp() {
  return String(randomInt(100000, 1000000));
}

export function hashOtp(email: string, otp: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must be configured with at least 32 characters");
  return createHmac("sha256", secret).update(`${normalizeEmail(email)}:${otp}`).digest("hex");
}

export function safeEqualHex(left: string, right: string) {
  if (!/^[a-f\d]{64}$/i.test(left) || !/^[a-f\d]{64}$/i.test(right)) return false;
  const leftBuffer = Buffer.from(left, "hex"), rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashRateLimitKey(namespace: string, value: string) {
  return createHmac("sha256", process.env.JWT_SECRET || "missing-config").update(`${namespace}:${value}`).digest("hex");
}
