import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

describe("admin access control", () => {
  it("rejects supplier management queries for non-admin users before database access", async () => {
    const ctx: TrpcContext = {
      user: { id: 7, openId: "ordinary-user", email: "user@example.com", name: "User", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.suppliers()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
