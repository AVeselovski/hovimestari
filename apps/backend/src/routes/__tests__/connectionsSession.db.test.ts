import { afterEach, beforeAll, beforeEach, expect, it, jest } from "@jest/globals";
import { testPassword } from "../../__tests__/support/credentials.js";
import { accessTokenWithoutFamily, familyOf, sessionApi } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Only a live session can make a key. An access token outlives the session it
// came from by up to 15 minutes, so a token from before a password change, a
// reset or a sign-out still passes `authenticate`. Making a key with it would
// hand out a credential that lasts up to a year after the session ended. The
// access token names its session's family, and the create requires a live
// refresh row of that family under the user lock.

await describeWithDb("connectionsSession", (suite) => {
  const s = sessionApi(suite);

  const create = (accessToken: string) =>
    s.api().post("/api/v1/connections").set(s.bearer(accessToken)).send({ name: "Claude" });

  /** How many keys the user has, in any state. */
  async function keysOf(userId: string): Promise<number> {
    const { rows } = await suite.client.query(
      "SELECT count(*)::int AS n FROM assistant_connections WHERE user_id = $1",
      [userId],
    );
    return rows[0].n as number;
  }

  function expectRefused(res: { status: number; body: { code?: string } }) {
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("session_expired");
  }

  beforeAll(async () => {
    const { env } = await import("../../lib/env.js");
    env.MCP_ENABLED = true;
    env.MCP_WRITES_ENABLED = false;
  });

  beforeEach(async () => {
    const { resetAuthRateLimits } = await import("../../middleware/authRateLimits.js");
    await resetAuthRateLimits();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("makes a key with the access token of a fresh sign-up and of a fresh sign-in", async () => {
    const user = await s.signedUp();
    expect((await create(user.accessToken)).status).toBe(201);

    const login = await s.login(user.email, user.password);
    expect(login.status).toBe(200);
    expect((await create(login.body.accessToken as string)).status).toBe(201);
  });

  it("makes a key with the access token a refresh answers, and with the one before it while the family lives", async () => {
    const user = await s.signedUp();
    const renewed = await s.refresh(user.refreshToken);
    expect(renewed.status).toBe(200);

    expect((await create(renewed.body.accessToken as string)).status).toBe(201);
    // The renewal keeps the family, so the earlier token's session is the same live session.
    expect((await create(user.accessToken)).status).toBe(201);
  });

  it("refuses an access token from before a password change, and makes nothing", async () => {
    const user = await s.signedUp();
    const changed = await s
      .api()
      .put("/api/v1/users/me/password")
      .set(s.bearer(user.accessToken))
      .send({ currentPassword: user.password, newPassword: testPassword() });
    expect(changed.status).toBe(204);

    expectRefused(await create(user.accessToken));
    expect(await keysOf(user.user.id)).toBe(0);
  });

  it("refuses a create that waited on the user lock while the session ended", async () => {
    const user = await s.signedUp();
    // The test plays a password change: it holds the user's row, ends every session and commits while the create waits.
    const other = await s.holdUserLock(user.user.id);
    const pending = create(user.accessToken).then((r) => r);
    expect(await s.queuedOnLock(1)).toBe(1);
    await other.query("DELETE FROM refresh_tokens WHERE user_id = $1", [user.user.id]);
    await other.commit();

    expectRefused(await pending);
    expect(await keysOf(user.user.id)).toBe(0);
  });

  it("refuses an access token from before a password reset", async () => {
    const user = await s.signedUp();
    const token = await s.mailedResetToken(user.email);
    const reset = await s.api().post("/api/v1/auth/reset-password").send({ token, newPassword: testPassword() });
    expect(reset.status).toBe(204);

    expectRefused(await create(user.accessToken));
    expect(await keysOf(user.user.id)).toBe(0);
  });

  it("refuses an access token from before signing out on all devices", async () => {
    const user = await s.signedUp();
    expect((await s.logoutAll(user.accessToken)).status).toBe(204);

    expectRefused(await create(user.accessToken));
    expect(await keysOf(user.user.id)).toBe(0);
  });

  it("refuses the access token of a session signed out, and keeps the user's other session working", async () => {
    const user = await s.signedUp();
    const other = await s.login(user.email, user.password);
    expect((await s.logout(user.refreshToken)).status).toBe(204);

    expectRefused(await create(user.accessToken));
    expect((await create(other.body.accessToken as string)).status).toBe(201);
    expect(await keysOf(user.user.id)).toBe(1);
  });

  it("refuses the access token of a session whose refresh tokens have all expired", async () => {
    const user = await s.signedUp();
    await suite.client.query("UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1", [
      user.user.id,
    ]);

    expectRefused(await create(user.accessToken));
  });

  it("refuses an access token that names no session, and one that names another user's", async () => {
    const user = await s.signedUp();
    const stranger = await s.signedUp();
    const { signAccessToken } = await import("../../lib/jwt.js");

    expectRefused(await create(accessTokenWithoutFamily(user.user.id)));
    expectRefused(await create(signAccessToken({ sub: user.user.id, fam: familyOf(stranger.refreshToken)! })));
    expectRefused(await create(signAccessToken({ sub: user.user.id, fam: "not-a-uuid" })));
    expect(await keysOf(user.user.id)).toBe(0);
  });

  it("still lists and revokes keys with a token that names no session", async () => {
    const user = await s.signedUp();
    const made = await create(user.accessToken);
    const legacy = s.bearer(accessTokenWithoutFamily(user.user.id));

    expect((await s.api().get("/api/v1/connections").set(legacy)).status).toBe(200);
    expect((await s.api().delete(`/api/v1/connections/${made.body.connection.id}`).set(legacy)).status).toBe(204);
  });
});
