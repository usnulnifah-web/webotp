import { describe, expect, it } from "vitest";
import { adminPasswordSchema, adminSetupInputSchema } from "./routers";

describe("admin setup validation", () => {
  it("accepts exactly six numeric digits", () => {
    expect(adminPasswordSchema.safeParse("123456").success).toBe(true);
    expect(adminPasswordSchema.safeParse("12345").success).toBe(false);
    expect(adminPasswordSchema.safeParse("1234567").success).toBe(false);
    expect(adminPasswordSchema.safeParse("12ab56").success).toBe(false);
  });

  it("accepts a safe username and rejects invalid usernames", () => {
    expect(adminSetupInputSchema.safeParse({ username: "admin_1", password: "123456", confirmPassword: "123456" }).success).toBe(true);
    expect(adminSetupInputSchema.safeParse({ username: "ab", password: "123456", confirmPassword: "123456" }).success).toBe(false);
    expect(adminSetupInputSchema.safeParse({ username: "admin name", password: "123456", confirmPassword: "123456" }).success).toBe(false);
  });
});
