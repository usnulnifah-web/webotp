import { afterEach, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret, signHmacSha256, verifyHmacSha256 } from "./_core/secrets";

const originalKey = process.env.SUPPLIER_CREDENTIAL_ENCRYPTION_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.SUPPLIER_CREDENTIAL_ENCRYPTION_KEY;
  else process.env.SUPPLIER_CREDENTIAL_ENCRYPTION_KEY = originalKey;
});

describe("secret helpers", () => {
  it("encrypts supplier credentials and decrypts them only server-side", () => {
    process.env.SUPPLIER_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const ciphertext = encryptSecret("provider-secret-123");
    expect(ciphertext).not.toContain("provider-secret-123");
    expect(decryptSecret(ciphertext)).toBe("provider-secret-123");
  });

  it("verifies raw-body HMAC signatures and rejects tampering", () => {
    const body = Buffer.from('{"event_id":"evt_1","status":"paid"}');
    const signature = signHmacSha256(body, "test-webhook-secret");
    expect(verifyHmacSha256(body, signature, "test-webhook-secret")).toBe(true);
    expect(verifyHmacSha256(Buffer.from('{"event_id":"evt_2","status":"paid"}'), signature, "test-webhook-secret")).toBe(false);
    expect(verifyHmacSha256(body, signature, undefined)).toBe(false);
  });
});
