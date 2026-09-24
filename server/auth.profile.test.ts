import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("auth.me", () => {
  it("never returns password, OTP, or normalized-login internals", async () => {
    const ctx = {
      user: {
        id: 7,
        openId: "local_test_user",
        name: "Customer",
        email: "customer@example.com",
        localEmail: "customer@example.com",
        passwordHash: "scrypt$hidden",
        pendingPasswordHash: "scrypt$pending-hidden",
        emailOtpHash: "a".repeat(64),
        emailOtpExpiresAt: new Date(),
        emailVerifiedAt: new Date(),
        emailOtpAttempts: 0,
        loginMethod: "email_password",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext;
    const result = await appRouter.createCaller(ctx).auth.me();
    expect(result).toMatchObject({ id: 7, email: "customer@example.com", role: "user" });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("pendingPasswordHash");
    expect(result).not.toHaveProperty("emailOtpHash");
    expect(result).not.toHaveProperty("localEmail");
  });
});
