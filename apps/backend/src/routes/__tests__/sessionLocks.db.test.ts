import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { testPassword } from "../../__tests__/support/credentials.js";
import { browserNonce } from "../../__tests__/support/google.js";
import { relayHeaders } from "../../__tests__/support/relay.js";
import { sessionApi, type Grant } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// The user row lock every write to a user's refresh rows takes first, on a
// real Postgres. A test holds the lock on its own connection, starts requests,
// and reads pg_locks to see them queue, so no test depends on a sleep. The
// numbers are the tests of section j in docs/design/session-renewal.md.

await describeWithDb("sessionLocks", (suite) => {
  const s = sessionApi(suite);

  beforeEach(async () => {
    const { resetAuthRateLimits } = await import("../../middleware/authRateLimits.js");
    await resetAuthRateLimits();
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("8. a renewal and a sign out everywhere both wait on the user lock (fails today)", async () => {
    const { user, accessToken, refreshToken } = await s.signedUp();
    const lock = await s.holdUserLock(user.id);

    const renewal = s.refresh(refreshToken).then((r) => r);
    const everywhere = s.logoutAll(accessToken).then((r) => r);
    const waited = await s.queuedOnLock(2);
    await lock.release();

    expect(waited).toBe(2); // today: 0, neither takes the lock
    expect((await everywhere).status).toBe(204);
    expect([200, 401]).toContain((await renewal).status);
  });

  it("8. a sign out on one device waits on the user lock too (fails today)", async () => {
    const { user, refreshToken } = await s.signedUp();
    const lock = await s.holdUserLock(user.id);

    const signOut = s.logout(refreshToken).then((r) => r);
    const waited = await s.queuedOnLock(1);
    await lock.release();

    expect(waited).toBe(1); // today: 0
    expect((await signOut).status).toBe(204);
    expect(await s.countOf(user.id)).toBe(0);
  });

  it("9. a renewal racing a sign out everywhere leaves no session (guard)", async () => {
    const { user, accessToken, refreshToken } = await s.signedUp();
    const lock = await s.holdUserLock(user.id);

    const renewal = s.refresh(refreshToken).then((r) => r);
    const everywhere = s.logoutAll(accessToken).then((r) => r);
    await s.queuedOnLock(2);
    await lock.release();

    const [renewed, ended] = await Promise.all([renewal, everywhere]);
    expect(ended.status).toBe(204);
    expect(await s.countOf(user.id)).toBe(0);
    for (const token of [refreshToken, (renewed.body as Partial<Grant>).refreshToken]) {
      if (token) expect((await s.refresh(token)).status).toBe(401);
    }
  });

  it("10. a lock wait that gives up answers 503 with Retry-After and leaves the token usable (fails today)", async () => {
    const { user, refreshToken } = await s.signedUp();
    const lock = await s.holdUserLock(user.id);

    let busy;
    try {
      busy = await s.refresh(refreshToken); // waits out the pool's 3 s lock_timeout
    } finally {
      await lock.release();
    }

    expect(busy.status).toBe(503); // today: 200 at once
    expect(busy.headers["retry-after"]).toBe("2");
    expect(busy.body).toEqual({ message: "The server is busy. Please try again." });
    expect((await s.refresh(refreshToken)).status).toBe(200);
  });

  it("14. a password sign-in queued behind a password change is refused (fails today)", async () => {
    const { hashPassword } = await import("../../lib/passwords.js");
    const { user, email, password } = await s.signedUp();
    const otherHash = await hashPassword(testPassword());
    const lock = await s.holdUserLock(user.id);

    const signIn = s.login(email, password).then((r) => r);
    let waited;
    try {
      waited = await s.queuedOnLock(1); // after bcrypt, at the lock
      await lock.query("UPDATE users SET password_hash = $1 WHERE id = $2", [otherHash, user.id]);
    } finally {
      await lock.commit();
    }

    const res = await signIn;
    expect(waited).toBe(1);
    expect(res.status).toBe(401); // today: 200 and a new row
    expect(res.body.code).toBe("invalid_credentials");
    expect(await s.countOf(user.id)).toBe(1);
  });

  it("14. a Google sign-in queued behind an unlink of Google is refused (fails today)", async () => {
    const { issueOneTimeCode } = await import("../../lib/oneTimeCodes.js");
    const { user } = await s.signedUp();
    const googleId = `google-lock-${Date.now()}`;
    await suite.client.query("UPDATE users SET google_id = $1 WHERE id = $2", [googleId, user.id]);
    const mine = browserNonce();
    const code = issueOneTimeCode("google-sign-in", { userId: user.id, bind: mine.bind, googleId });
    const lock = await s.holdUserLock(user.id);

    const exchange = s
      .api()
      .post("/api/v1/auth/google/exchange")
      .set(relayHeaders())
      .send({ code, nonce: mine.nonce })
      .then((r) => r);
    let waited;
    try {
      waited = await s.queuedOnLock(1);
      await lock.query("UPDATE users SET google_id = NULL WHERE id = $1", [user.id]);
    } finally {
      await lock.commit();
    }

    const res = await exchange;
    expect(waited).toBe(1);
    expect(res.status).toBe(401); // today: 200 and a new row
    expect(res.body.code).toBe("google_failed");
    expect(await s.countOf(user.id)).toBe(1);
  });

  it("a Google sign-in is refused when the account's Google link changed between the callback and the exchange", async () => {
    const { issueOneTimeCode } = await import("../../lib/oneTimeCodes.js");
    const { user } = await s.signedUp();
    const consented = `google-consented-${Date.now()}`;
    await suite.client.query("UPDATE users SET google_id = $1 WHERE id = $2", [consented, user.id]);
    const mine = browserNonce();
    const code = issueOneTimeCode("google-sign-in", { userId: user.id, bind: mine.bind, googleId: consented });
    // Unlinked and relinked to another Google account before the web server traded the code.
    await suite.client.query("UPDATE users SET google_id = $1 WHERE id = $2", [`google-other-${Date.now()}`, user.id]);

    const res = await s
      .api()
      .post("/api/v1/auth/google/exchange")
      .set(relayHeaders())
      .send({ code, nonce: mine.nonce });

    expect(res.status).toBe(401); // before: 200, the proof was the Google id read at exchange time
    expect(res.body.code).toBe("google_failed");
    expect(await s.countOf(user.id)).toBe(1);
  });

  it("a password reset and an account deletion at once do not deadlock: the reset waits for the user row", async () => {
    const { user, email } = await s.signedUp();
    const token = await s.mailedResetToken(email);
    // The deletion's first lock: the user row.
    const deletion = await s.holdUserLock(user.id);

    const reset = s
      .api()
      .post("/api/v1/auth/reset-password")
      .send({ token, newPassword: testPassword() })
      .then((r) => r);
    let waited;
    let deleted;
    try {
      waited = await s.queuedOnLock(1);
      // The deletion cascades to the reset link. Before, the reset already held the link's row and waited
      // for the user row, so Postgres broke the cycle by aborting one side.
      deleted = await deletion.query("DELETE FROM users WHERE id = $1", [user.id]).then(
        (r) => r.rowCount,
        (err: { code?: string }) => err.code,
      );
    } finally {
      await deletion.commit();
    }

    const res = await reset;
    expect(waited).toBe(1);
    expect(deleted).toBe(1); // before: 40P01, or the reset failed with it
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("reset_link_invalid");
  });
});
