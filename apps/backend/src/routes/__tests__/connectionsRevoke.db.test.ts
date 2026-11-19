import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { randomBytes } from "node:crypto";
import { testPassword } from "../../__tests__/support/credentials.js";
import { sessionApi, type Grant } from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// A password change and a password reset revoke every connection key of the
// user, in the same transaction that ends the sessions. The transaction is
// proven one by failing it at its commit: a deferred trigger on the deletion
// of the user's refresh rows raises only once every statement has run, the
// revocation included, so a revocation that ran on its own would stay. The
// other direction is proven by failing the revocation itself: an immediate
// trigger raises on it, and the password must stay as it was, so a revocation
// moved out of the transaction, after the password was committed, is caught.

await describeWithDb("connectionsRevoke", (suite) => {
  const s = sessionApi(suite);

  beforeAll(async () => {
    const { env } = await import("../../lib/env.js");
    env.MCP_ENABLED = true;
    env.MCP_WRITES_ENABLED = true;
  });

  beforeEach(async () => {
    const { resetAuthRateLimits } = await import("../../middleware/authRateLimits.js");
    await resetAuthRateLimits();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** A signed-up user with a read key, a writing key and an expired key. */
  async function withKeys(): Promise<Grant & { email: string; password: string }> {
    const user = await s.signedUp();
    const auth = s.bearer(user.accessToken);
    for (const body of [
      { name: "Reader" },
      { name: "Writer", access: "read_write", expiresInDays: 7 },
      { name: "Old" },
    ]) {
      const res = await s.api().post("/api/v1/connections").set(auth).send(body);
      if (res.status !== 201) throw new Error(`create answered ${res.status}`);
    }
    await suite.client.query(
      "UPDATE assistant_connections SET expires_at = now() - interval '1 second' WHERE user_id = $1 AND name = 'Old'",
      [user.user.id],
    );
    return user;
  }

  /** How many of the user's keys are not revoked, in any state. */
  async function unrevoked(userId: string): Promise<number> {
    const { rows } = await suite.client.query(
      "SELECT count(*)::int AS n FROM assistant_connections WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    );
    return rows[0].n as number;
  }

  const changePassword = (user: Grant & { password: string }, newPassword: string) =>
    s
      .api()
      .put("/api/v1/users/me/password")
      .set(s.bearer(user.accessToken))
      .send({ currentPassword: user.password, newPassword });

  const reset = (token: string, newPassword: string) =>
    s.api().post("/api/v1/auth/reset-password").send({ token, newPassword });

  /**
   * Makes the transaction that deletes `userId`'s refresh rows fail at its
   * commit, after its last statement. Answers the function that removes it.
   */
  async function failAtCommit(userId: string): Promise<() => Promise<void>> {
    const fn = `fail_commit_${randomBytes(4).toString("hex")}`;
    await suite.client.query(`
      CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.user_id = '${userId}' THEN RAISE EXCEPTION 'forced failure at commit'; END IF;
        RETURN NULL;
      END $$;
      CREATE CONSTRAINT TRIGGER ${fn} AFTER DELETE ON refresh_tokens
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${fn}();
    `);
    return async () => {
      await suite.client.query(`DROP TRIGGER ${fn} ON refresh_tokens; DROP FUNCTION ${fn}();`);
    };
  }

  /** Makes every revocation of `userId`'s keys fail at once. Answers the function that removes it. */
  async function failRevocation(userId: string): Promise<() => Promise<void>> {
    const fn = `fail_revoke_${randomBytes(4).toString("hex")}`;
    await suite.client.query(`
      CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.user_id = '${userId}' AND OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN
          RAISE EXCEPTION 'forced failure of the revocation';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER ${fn} BEFORE UPDATE ON assistant_connections FOR EACH ROW EXECUTE FUNCTION ${fn}();
    `);
    return async () => {
      await suite.client.query(`DROP TRIGGER ${fn} ON assistant_connections; DROP FUNCTION ${fn}();`);
    };
  }

  describe("a password change", () => {
    it("revokes every key of the user, active, writing and expired, and no one else's", async () => {
      const user = await withKeys();
      const other = await withKeys();
      expect(await unrevoked(user.user.id)).toBe(3);

      expect((await changePassword(user, testPassword())).status).toBe(204);

      expect(await unrevoked(user.user.id)).toBe(0);
      expect(await unrevoked(other.user.id)).toBe(3);
    });

    it("revokes nothing when it fails, because the revocation is in its transaction", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const user = await withKeys();
      const restore = await failAtCommit(user.user.id);
      try {
        expect((await changePassword(user, testPassword())).status).toBe(500);
      } finally {
        await restore();
      }

      expect(await unrevoked(user.user.id)).toBe(3);
      expect((await s.login(user.email, user.password)).status).toBe(200);
    });

    it("leaves the password as it was when the revocation fails", async () => {
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const user = await withKeys();
      const restore = await failRevocation(user.user.id);
      try {
        expect((await changePassword(user, testPassword())).status).toBe(500);
      } finally {
        await restore();
      }

      expect(await unrevoked(user.user.id)).toBe(3);
      expect((await s.login(user.email, user.password)).status).toBe(200);
    });

    it("revokes nothing when the current password is wrong", async () => {
      const user = await withKeys();

      const res = await changePassword({ ...user, password: testPassword() }, testPassword());

      expect(res.status).toBe(401);
      expect(await unrevoked(user.user.id)).toBe(3);
    });
  });

  describe("a password reset", () => {
    it("revokes every key of the user, and no one else's", async () => {
      const user = await withKeys();
      const other = await withKeys();
      const token = await s.mailedResetToken(user.email);

      expect((await reset(token, testPassword())).status).toBe(204);

      expect(await unrevoked(user.user.id)).toBe(0);
      expect(await unrevoked(other.user.id)).toBe(3);
    });

    it("revokes nothing when it fails, because the revocation is in its transaction", async () => {
      const user = await withKeys();
      const token = await s.mailedResetToken(user.email);
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const restore = await failAtCommit(user.user.id);
      try {
        expect((await reset(token, testPassword())).status).toBe(500);
      } finally {
        await restore();
      }

      expect(await unrevoked(user.user.id)).toBe(3);
      expect((await s.login(user.email, user.password)).status).toBe(200);
    });

    it("leaves the password as it was when the revocation fails", async () => {
      const user = await withKeys();
      const token = await s.mailedResetToken(user.email);
      jest.spyOn(console, "error").mockImplementation(() => undefined);
      const restore = await failRevocation(user.user.id);
      try {
        expect((await reset(token, testPassword())).status).toBe(500);
      } finally {
        await restore();
      }

      expect(await unrevoked(user.user.id)).toBe(3);
      expect((await s.login(user.email, user.password)).status).toBe(200);
    });

    it("revokes nothing on a link that does not work", async () => {
      const user = await withKeys();

      const res = await reset(randomBytes(32).toString("hex"), testPassword());

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("reset_link_invalid");
      expect(await unrevoked(user.user.id)).toBe(3);
    });
  });
});
