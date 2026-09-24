import { afterAll, describe, expect, it, vi } from "vitest";

const previousSecret = process.env.JWT_SECRET;
const previousAppId = process.env.VITE_APP_ID;
process.env.JWT_SECRET = "test-only-session-secret-at-least-32-bytes";
process.env.VITE_APP_ID = "webotp-test";
vi.resetModules();
const { sdk } = await import("./_core/sdk");

afterAll(() => {
  if (previousSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = previousSecret;
  if (previousAppId === undefined) delete process.env.VITE_APP_ID;
  else process.env.VITE_APP_ID = previousAppId;
});

describe("member session source", () => {
  it("accepts the signed first-party email claim and rejects legacy Manus sessions", async () => {
    const emailToken = await sdk.createSessionToken("local_test_user", { name: "Member", authSource: "email" });
    const legacyToken = await sdk.createSessionToken("legacy_oauth_user", { name: "Old session" });
    await expect(sdk.verifySession(emailToken)).resolves.toMatchObject({ authSource: "email", openId: "local_test_user" });
    await expect(sdk.verifySession(legacyToken)).resolves.toMatchObject({ openId: "legacy_oauth_user" });
    await expect(sdk.authenticateRequest({ headers: { cookie: `app_session_id=${legacyToken}` } } as any)).rejects.toThrow(/WebOTP email account/i);
  });
});
