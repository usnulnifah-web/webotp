import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

function encryptionKey() {
  const encoded = process.env.SUPPLIER_CREDENTIAL_ENCRYPTION_KEY;
  if (!encoded) throw new Error("SUPPLIER_CREDENTIAL_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("SUPPLIER_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return key;
}

export function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(encrypted: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext] = encrypted.split(".");
  if (version !== "v1" || !encodedIv || !encodedTag || !encodedCiphertext) throw new Error("Unsupported encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(encodedIv, "base64url"));
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encodedCiphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function verifyHmacSha256(rawBody: Buffer, signatureHeader: string | undefined, secret: string | undefined) {
  if (!secret || !signatureHeader) return false;
  const supplied = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  if (!/^[a-f\d]{64}$/i.test(supplied)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const candidate = Buffer.from(supplied, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function signHmacSha256(rawBody: Buffer, secret: string) {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

export function hasSupplierEncryptionKey() {
  try { encryptionKey(); return true; } catch { return false; }
}
