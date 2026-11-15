import { beforeEach, expect, it, jest } from "@jest/globals";
import request from "supertest";
import { testPassword } from "../../__tests__/support/credentials.js";
import { browserNonce } from "../../__tests__/support/google.js";
import { relayHeaders } from "../../__tests__/support/relay.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Every account flow on a real, migrated Postgres: the transactions, the
// CHECK, the cascade and the WHERE clauses a mocked database never runs.

let n = 0;
/** An address no other test in the suite uses. */
const freshEmail = () => `user${++n}-${Date.now()}@example.com`;

await describeWithDb("authFlow", (suite) => {
  let resetLimits: () => Promise<void>;
  beforeEach(async () => {
    ({ resetAuthRateLimits: resetLimits } = await import("../../middleware/authRateLimits.js"));
    await resetLimits();
  });

  const api = () => request(suite.app);
  const bearer = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });
  const register = (email: string, password: string) =>
    api().post("/api/v1/auth/register").set(relayHeaders()).send({ email, password });
  const login = (email: string, password: string) =>
    api().post("/api/v1/auth/login").set(relayHeaders()).send({ email, password });
  const refresh = (refreshToken: string) =>
    api().post("/api/v1/auth/refresh").set(relayHeaders()).send({ refreshToken });

  async function signedUp() {
    const email = freshEmail();
    const password = testPassword();
    const res = await register(email, password);
    expect(res.status).toBe(201);
    return { email, password, ...(res.body as { accessToken: string; refreshToken: string; user: { id: string } }) };
  }

  /** The reset token the console mailer wrote, once the route's background work has sent it. */
  async function mailedToken(log: { mock: { calls: unknown[][] } }): Promise<string | undefined> {
    const read = () =>
      /reset-password\?token=([0-9a-f]+)/.exec(log.mock.calls.map((c) => String(c[0])).join("\n"))?.[1];
    for (let i = 0; i < 200 && !read(); i++) await new Promise((resolve) => setTimeout(resolve, 10));
    return read();
  }

  async function count(table: string, userId: string): Promise<number> {
    const { rows } = await suite.client.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`, [userId]);
    return rows[0].n as number;
  }

  async function googleOnlyUser(): Promise<{ id: string; email: string; googleId: string }> {
    const email = freshEmail();
    const googleId = `google-${n}-${Date.now()}`;
    const { rows } = await suite.client.query("INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING id", [
      email,
      googleId,
    ]);
    return { id: rows[0].id as string, email, googleId };
  }

  it("signs up, stores the email lower-case, and answers the session grant", async () => {
    const email = freshEmail();
    const res = await register(email.toUpperCase(), testPassword());

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      email,
      hasPassword: true,
      hasGoogle: false,
      foodNameLanguage: "fi",
      timeZone: "Europe/Helsinki",
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    const { rows } = await suite.client.query("SELECT email FROM users WHERE id = $1", [res.body.user.id]);
    expect(rows[0].email).toBe(email);
    expect(await count("refresh_tokens", res.body.user.id)).toBe(1);
  });

  it("refuses a second account for the same address in another letter case", async () => {
    const { email } = await signedUp();
    const res = await register(email.toUpperCase(), testPassword());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("email_taken");
  });

  it("refuses a mixed-case email written past the schema", async () => {
    await expect(
      suite.client.query("INSERT INTO users (email, google_id) VALUES ('Mixed@Example.com', 'g-mixed')"),
    ).rejects.toMatchObject({ code: "23514", constraint: "users_email_lower" });
  });

  it("signs in with the password in any letter case of the email, and refuses a wrong password", async () => {
    const { email, password } = await signedUp();
    expect((await login(email.toUpperCase(), password)).status).toBe(200);
    const wrong = await login(email, testPassword());
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("invalid_credentials");
  });

  it("rotates a refresh token, and a token used twice succeeds once", async () => {
    const { refreshToken } = await signedUp();

    const first = await refresh(refreshToken);
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);

    const again = await refresh(refreshToken);
    expect(again.status).toBe(401);
    expect(again.body.code).toBe("session_expired");

    expect((await refresh(first.body.refreshToken)).status).toBe(200);
  });

  it("gives two concurrent refreshes with one token exactly one success", async () => {
    const { refreshToken, user } = await signedUp();

    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken), refresh(refreshToken)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 401, 401]);
    expect(await count("refresh_tokens", user.id)).toBe(1);
  });

  it("logs out one session, and the token stops working", async () => {
    const { refreshToken, user } = await signedUp();
    const res = await api().post("/api/v1/auth/logout").set(relayHeaders()).send({ refreshToken });
    expect(res.status).toBe(204);
    expect(await count("refresh_tokens", user.id)).toBe(0);
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it("logs out every session with logout-all", async () => {
    const { email, password, accessToken, refreshToken, user } = await signedUp();
    const other = await login(email, password);

    expect((await api().post("/api/v1/auth/logout-all").set(bearer(accessToken))).status).toBe(204);

    expect(await count("refresh_tokens", user.id)).toBe(0);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await refresh(other.body.refreshToken)).status).toBe(401);
  });

  it("resets a forgotten password: the link works once and ends every session", async () => {
    const { email, password, refreshToken } = await signedUp();
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    expect((await api().post("/api/v1/auth/forgot-password").send({ email })).status).toBe(200);
    const token = await mailedToken(log);
    log.mockRestore();
    expect(token).toBeDefined();

    const newPassword = testPassword();
    const reset = await api().post("/api/v1/auth/reset-password").send({ token, newPassword });
    expect(reset.status).toBe(204);

    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await login(email, password)).status).toBe(401);
    expect((await login(email, newPassword)).status).toBe(200);
    const twice = await api().post("/api/v1/auth/reset-password").send({ token, newPassword: testPassword() });
    expect(twice.status).toBe(400);
    expect(twice.body.code).toBe("reset_link_invalid");
  });

  it("lets two concurrent uses of one reset link set the password once", async () => {
    const { email } = await signedUp();
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    await api().post("/api/v1/auth/forgot-password").send({ email });
    const token = await mailedToken(log);
    log.mockRestore();

    const results = await Promise.all(
      [testPassword(), testPassword()].map((newPassword) =>
        api().post("/api/v1/auth/reset-password").send({ token, newPassword }),
      ),
    );

    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
  });

  it("sweeps the account's expired reset links when it stores a new one", async () => {
    const { email, user } = await signedUp();
    await suite.client.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() - interval '1 hour')",
      [user.id, `expired-${Date.now()}`],
    );
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    await api().post("/api/v1/auth/forgot-password").send({ email });
    await mailedToken(log);
    log.mockRestore();

    const { rows } = await suite.client.query(
      "SELECT count(*)::int AS n, count(*) FILTER (WHERE expires_at < now())::int AS expired FROM password_reset_tokens WHERE user_id = $1",
      [user.id],
    );
    expect(rows[0]).toEqual({ n: 1, expired: 0 });
  });

  it("changes the password with the current one, and ends every session", async () => {
    const { email, password, accessToken, refreshToken } = await signedUp();
    const change = (currentPassword: string, newPassword: string) =>
      api().put("/api/v1/users/me/password").set(bearer(accessToken)).send({ currentPassword, newPassword });

    const wrong = await change(testPassword(), testPassword());
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe("current_password_wrong");

    const newPassword = testPassword();
    expect((await change(password, newPassword)).status).toBe(204);
    expect((await refresh(refreshToken)).status).toBe(401);
    expect((await login(email, newPassword)).status).toBe(200);
  });

  it("answers 403 no_password to a password change on a Google-only account", async () => {
    const { signAccessToken } = await import("../../lib/jwt.js");
    const google = await googleOnlyUser();
    const res = await api()
      .put("/api/v1/users/me/password")
      .set(bearer(signAccessToken({ sub: google.id })))
      .send({ currentPassword: testPassword(), newPassword: testPassword() });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("no_password");
  });

  it("refuses to unlink the last sign-in method, and the CHECK refuses it too", async () => {
    const { accessToken, user } = await signedUp();
    const res = await api().delete("/api/v1/auth/unlink/password").set(bearer(accessToken));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("last_sign_in_method");

    await expect(
      suite.client.query("UPDATE users SET password_hash = NULL WHERE id = $1", [user.id]),
    ).rejects.toMatchObject({ code: "23514", constraint: "users_has_sign_in_method" });
  });

  it("adds a password to a Google-only account, then lets it unlink Google", async () => {
    const { signAccessToken } = await import("../../lib/jwt.js");
    const google = await googleOnlyUser();
    const auth = bearer(signAccessToken({ sub: google.id }));

    const added = await api().post("/api/v1/auth/link/password").set(auth).send({ password: testPassword() });
    expect(added.status).toBe(200);
    expect(added.body).toEqual({
      id: google.id,
      email: google.email,
      hasPassword: true,
      hasGoogle: true,
      foodNameLanguage: "fi",
      timeZone: "Europe/Helsinki",
    });
    const again = await api().post("/api/v1/auth/link/password").set(auth).send({ password: testPassword() });
    expect(again.status).toBe(409);

    const unlinked = await api().delete("/api/v1/auth/unlink/google").set(auth);
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.hasGoogle).toBe(false);
  });

  it("refuses { email } on a password account, then deletes it with the password, and every row cascades", async () => {
    const { email, password, accessToken, user } = await signedUp();
    const del = (body: object) => api().delete("/api/v1/users/me").set(bearer(accessToken)).send(body);

    const byEmail = await del({ email });
    expect(byEmail.status).toBe(400);
    expect(byEmail.body.code).toBe("confirmation_mismatch");
    const wrong = await del({ password: testPassword() });
    expect(wrong.body.code).toBe("confirmation_mismatch");

    expect((await del({ password })).status).toBe(204);
    const { rows } = await suite.client.query("SELECT 1 FROM users WHERE id = $1", [user.id]);
    expect(rows).toHaveLength(0);
    expect(await count("refresh_tokens", user.id)).toBe(0);
  });

  it("deletes a Google-only account confirmed by its email", async () => {
    const { signAccessToken } = await import("../../lib/jwt.js");
    const google = await googleOnlyUser();
    const res = await api()
      .delete("/api/v1/users/me")
      .set(bearer(signAccessToken({ sub: google.id })))
      .send({ email: google.email.toUpperCase() });
    expect(res.status).toBe(204);
  });

  it("counts failed delete confirmations toward a per-user budget", async () => {
    const { accessToken } = await signedUp();
    for (let i = 0; i < 10; i++) {
      await api().delete("/api/v1/users/me").set(bearer(accessToken)).send({ password: testPassword() });
    }
    const limited = await api().delete("/api/v1/users/me").set(bearer(accessToken)).send({ password: testPassword() });
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("delete_rate_limited");
  });

  it("Google sign-in finds the account by Google id, refuses an address held by another account, and creates one otherwise", async () => {
    const { signInWithGoogle } = await import("../../lib/passport.js");
    const profile = (id: string, email: string, verified = true) =>
      ({ id, emails: [{ value: email, verified }] }) as never;

    const linked = await googleOnlyUser();
    expect(await signInWithGoogle(profile(linked.googleId, "other@example.com"))).toEqual({ id: linked.id });
    // Found by Google id, the address is never read: an unverified one does not lock the owner out.
    expect(await signInWithGoogle(profile(linked.googleId, linked.email, false))).toEqual({ id: linked.id });

    // The address belongs to an account linked to a different Google id: never signed in.
    expect(await signInWithGoogle(profile(`google-other-${Date.now()}`, linked.email))).toEqual({
      id: "",
      error: "email_taken",
    });
    const { email } = await signedUp();
    expect(await signInWithGoogle(profile(`google-new-${Date.now()}`, email.toUpperCase()))).toEqual({
      id: "",
      error: "email_taken",
    });

    // Google has not verified the address: refused before any lookup, so it can claim nobody's address.
    expect(await signInWithGoogle(profile(`google-unverified-${Date.now()}`, freshEmail(), false))).toEqual({
      id: "",
      error: "email_unverified",
    });

    const fresh = freshEmail();
    const created = await signInWithGoogle(profile(`google-fresh-${Date.now()}`, fresh.toUpperCase()));
    const { rows } = await suite.client.query("SELECT email, password_hash FROM users WHERE id = $1", [created.id]);
    expect(rows[0]).toEqual({ email: fresh, password_hash: null });
  });

  // ---------------------------------------------------------------------------
  // One-time codes from the Google callbacks, traded by the web server
  // ---------------------------------------------------------------------------

  it("trades a sign-in code with its browser's nonce for a session, and refuses a foreign nonce or a spent code", async () => {
    const { issueOneTimeCode } = await import("../../lib/oneTimeCodes.js");
    const google = await googleOnlyUser();
    const exchange = (code: string, nonce: string) =>
      api().post("/api/v1/auth/google/exchange").set(relayHeaders()).send({ code, nonce });

    const mine = browserNonce();
    const foreign = await exchange(
      issueOneTimeCode("google-sign-in", { userId: google.id, bind: mine.bind }),
      browserNonce().nonce,
    );
    expect(foreign.status).toBe(401);
    expect(foreign.body.code).toBe("google_failed");

    const code = issueOneTimeCode("google-sign-in", { userId: google.id, bind: mine.bind });
    const ok = await exchange(code, mine.nonce);
    expect(ok.status).toBe(200);
    expect(ok.body.user.id).toBe(google.id);

    expect((await exchange(code, mine.nonce)).status).toBe(401);
  });

  it("links Google only for the browser that started it", async () => {
    const { issueOneTimeCode } = await import("../../lib/oneTimeCodes.js");
    const { user } = await signedUp();
    const googleId = `google-link-${Date.now()}`;
    const linkedId = async () =>
      (await suite.client.query("SELECT google_id FROM users WHERE id = $1", [user.id])).rows[0].google_id as
        string | null;
    const exchange = (body: object) => api().post("/api/v1/auth/link/google/exchange").set(relayHeaders()).send(body);
    const mine = browserNonce();
    const codeFor = (id = googleId) =>
      issueOneTimeCode("google-link", { userId: user.id, bind: mine.bind, googleId: id });

    const foreign = await exchange({ code: codeFor(), nonce: browserNonce().nonce });
    expect(foreign.status).toBe(401);
    expect(foreign.body.code).toBe("google_failed");
    expect(await linkedId()).toBeNull();

    const noNonce = await exchange({ code: codeFor() });
    expect(noNonce.status).toBe(400);
    expect(await linkedId()).toBeNull();

    const held = await googleOnlyUser();
    const taken = await exchange({ code: codeFor(held.googleId), nonce: mine.nonce });
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe("google_taken");
    expect(await linkedId()).toBeNull();

    const code = codeFor();
    expect((await exchange({ code, nonce: mine.nonce })).status).toBe(204);
    expect(await linkedId()).toBe(googleId);

    // Spent: a replay links nothing new.
    await suite.client.query("UPDATE users SET google_id = NULL WHERE id = $1", [user.id]);
    expect((await exchange({ code, nonce: mine.nonce })).status).toBe(401);
    expect(await linkedId()).toBeNull();
  });
});
