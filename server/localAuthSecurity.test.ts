import { afterEach, describe, expect, it } from "vitest";
import { generateOtp, hashOtp, hashPassword, normalizeEmail, safeEqualHex, verifyPassword } from "./_core/localAuthSecurity";

const originalJwtSecret = process.env.JWT_SECRET;
afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

describe("local auth security helpers", () => {
  it("stores passwords as salted scrypt hashes and checks them safely", async () => {
    const hash = await hashPassword("a-strong-test-password");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(hash).not.toContain("a-strong-test-password");
    await expect(verifyPassword("a-strong-test-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect-password", hash)).resolves.toBe(false);
  });

  it("generates expiring OTP material from a keyed hash, not a stored code", () => {
    process.env.JWT_SECRET = "a-test-secret-that-is-at-least-32-bytes";
    const otp = generateOtp();
    const digest = hashOtp(" User@Example.com ", otp);
    expect(otp).toMatch(/^\d{6}$/);
    expect(digest).not.toContain(otp);
    expect(safeEqualHex(hashOtp("user@example.com", otp), digest)).toBe(true);
    expect(safeEqualHex(hashOtp("user@example.com", "000000"), digest)).toBe(false);
    expect(normalizeEmail(" User@Example.com ")).toBe("user@example.com");
  });
});
