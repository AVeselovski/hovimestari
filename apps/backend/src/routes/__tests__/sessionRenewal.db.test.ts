import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { testPassword } from "../../__tests__/support/credentials.js";
import {
  familyOf,
  hashOf,
  reuseLines,
  sessionApi,
  tokenWithoutFamily,
  type Grant,
} from "../../__tests__/support/sessionApi.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// Renewing a session on a real Postgres: a renewal whose answer is lost, races
// of renewals with one token, reuse of a dead token, and every way a session
// ends with superseded rows present. The numbers are the tests of section j in
// docs/design/session-renewal.md. "Fails today" tests failed on the code before
// token families. "Guard" tests pin behaviour the change keeps.

await describeWithDb("sessionRenewal", (suite) => {
  const s = sessionApi(suite);
  let warn: ReturnType<typeof jest.spyOn>;

  beforeEach(async () => {
    const { resetAuthRateLimits } = await import("../../middleware/authRateLimits.js");
    await resetAuthRateLimits();
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  /** A renewal that must succeed, and the grant it answered. */
  async function renewed(token: string): Promise<Grant> {
    const res = await s.refresh(token);
    expect(res.status).toBe(200);
    return res.body as Grant;
  }

  async function expectRefused(token: string) {
    const res = await s.refresh(token);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("session_expired");
  }

  /** The state of test 1 before its last step: P superseded, its successors H and H2 live. */
  async function lostAnswerState() {
    const grant = await s.signedUp();
    const P = grant.refreshToken;
    const H = (await renewed(P)).refreshToken; // the answer the phone never saw
    const H2 = (await renewed(P)).refreshToken;
    return { ...grant, P, H, H2 };
  }

  it("1. lost answer (fails today): the spent token renews again, and using a successor ends the others", async () => {
    const { user, refreshToken: P } = await s.signedUp();
    await s.refresh(P); // the server commits, the answer is lost

    const again = await s.refresh(P);
    expect(again.status).toBe(200); // today: 401
    expect((await renewed(again.body.refreshToken)).refreshToken).toEqual(expect.any(String));
    expect(await s.countOf(user.id)).toBe(2);

    await expectRefused(P);
  });

  it("1. lost answer (fails today): the discarded successor answers 401 once a sibling is used", async () => {
    const { user, P, H, H2 } = await lostAnswerState();
    await renewed(H2);
    expect(await s.countOf(user.id)).toBe(2);
    await expectRefused(H);
    await expectRefused(P);
  });

  it("2. lost answer, then sign out with P (fails today): the whole family ends", async () => {
    const { user, refreshToken: P } = await s.signedUp();
    const H = (await renewed(P)).refreshToken;

    expect((await s.logout(P)).status).toBe(204);

    expect(await s.countOf(user.id)).toBe(0); // today: 1, H survives
    await expectRefused(P);
    await expectRefused(H);
  });

  it("3. race of three (fails today): every renewal answers a live token, and the first used ends the others", async () => {
    const { user, refreshToken: P } = await s.signedUp();

    const results = await Promise.all([s.refresh(P), s.refresh(P), s.refresh(P)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]); // today: [200, 401, 401] in some order
    expect(await s.rowsOf(user.id)).toEqual({ total: 4, live: 3, superseded: 1 });

    const [used, ...others] = results.map((r) => (r.body as Grant).refreshToken);
    await renewed(used);
    expect(await s.countOf(user.id)).toBe(2);
    for (const token of others) await expectRefused(token);
    // Presenting a sibling after another was used is a reuse, and ends the family.
    expect(await s.countOf(user.id)).toBe(0);
  });

  it("4. race of many (fails today): eight at once all succeed, the family stays capped, and one use trims it", async () => {
    const { MAX_UNUSED_SUCCESSORS } = await import("../../lib/sessions.js");
    const { user, refreshToken: P } = await s.signedUp();

    const results = await Promise.all(Array.from({ length: 8 }, () => s.refresh(P)));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200)); // today: one 200
    const rows = await s.rowsOf(user.id);
    expect(rows.live).toBeLessThanOrEqual(MAX_UNUSED_SUCCESSORS);
    expect(rows.total).toBeLessThanOrEqual(MAX_UNUSED_SUCCESSORS + 1);

    const tokens = results.map((r) => (r.body as Grant).refreshToken);
    const live = [];
    for (const token of tokens) if (await s.stored(token)) live.push(token);
    expect(live).toHaveLength(rows.live);
    await renewed(live[0]);
    expect(await s.countOf(user.id)).toBe(2);
  });

  it("5a. reuse (fails today): a predecessor presented after its successor was used is refused and logged", async () => {
    const { user, email, refreshToken: P } = await s.signedUp();
    const H = (await renewed(P)).refreshToken;
    const H1 = (await renewed(H)).refreshToken;
    warn.mockClear();

    await expectRefused(P);

    const lines = reuseLines(warn); // today: no log
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(user.id);
    expect(lines[0]).toContain(familyOf(H1));
    for (const secret of [P, hashOf(P), email]) expect(lines[0]).not.toContain(secret);
    // A reuse ends the family: the live token the thief or the owner held dies with it.
    expect(await s.countOf(user.id)).toBe(0);
    await expectRefused(H1);
  });

  it("5b. reuse (fails today): a sibling presented after another sibling was used is refused and logged", async () => {
    const { user, refreshToken: P } = await s.signedUp();
    const H1 = (await renewed(P)).refreshToken;
    const H2 = (await renewed(P)).refreshToken; // today: 401 here
    const next = (await renewed(H1)).refreshToken;
    warn.mockClear();

    await expectRefused(H2);

    const lines = reuseLines(warn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(user.id);
    expect(lines[0]).toContain(familyOf(next));
    expect(await s.countOf(user.id)).toBe(0);
    await expectRefused(next);
  });

  it("5c. reuse ends only that family: every sibling of it answers 401, another sign-in of the user is untouched", async () => {
    const { user, email, password, refreshToken: P } = await s.signedUp();
    const other = ((await s.login(email, password)).body as Grant).refreshToken;
    const H1 = (await renewed(P)).refreshToken;
    const H2 = (await renewed(P)).refreshToken;
    const H3 = (await renewed(P)).refreshToken;
    const next = (await renewed(H1)).refreshToken;
    const family = familyOf(next);

    await expectRefused(H2); // today: refused, and H3's family keeps living

    const { rows } = await suite.client.query("SELECT count(*)::int AS n FROM refresh_tokens WHERE family_id = $1", [
      family,
    ]);
    expect(rows[0].n).toBe(0);
    for (const token of [next, H3, P]) await expectRefused(token);
    expect(await s.countOf(user.id)).toBe(1);
    await renewed(other);
  });

  it("5d. a thief who renewed first and kept renewing loses the session at the owner's next renewal", async () => {
    const { user, refreshToken: T } = await s.signedUp();
    const stolen = (await renewed(T)).refreshToken; // the thief uses the copy first
    const kept = (await renewed(stolen)).refreshToken; // and rotates on

    await expectRefused(T); // the owner returns: a recognised reuse

    expect(await s.countOf(user.id)).toBe(0);
    await expectRefused(kept); // today: the thief keeps renewing
  });

  it("5e. a thief who renewed first, beside an owner who renewed after, loses it when the owner's sibling is presented after the thief's", async () => {
    const { user, refreshToken: T } = await s.signedUp();
    const thief = (await renewed(T)).refreshToken; // thief first, T superseded
    const owner = (await renewed(T)).refreshToken; // owner's sibling, 200
    const thiefNext = (await renewed(thief)).refreshToken; // the thief uses theirs first: the owner's sibling is deleted

    await expectRefused(owner); // the owner's next renewal is a recognised reuse

    expect(await s.countOf(user.id)).toBe(0);
    await expectRefused(thiefNext);
  });

  it("6. not reuse (guard): a token of an ended family, or one without a family, is refused without a reuse log", async () => {
    const { user, email, password, refreshToken: ended } = await s.signedUp();
    // A second sign-in: the user keeps a live family, so a check that looked at the user and not the family would fire.
    const { refreshToken: live } = (await s.login(email, password)).body as Grant;
    expect((await s.logout(ended)).status).toBe(204);
    warn.mockClear();

    await expectRefused(ended);
    await expectRefused(tokenWithoutFamily(user.id));

    expect(reuseLines(warn)).toEqual([]);
    await renewed(live);
  });

  it.each([
    ["sign out everywhere", async (st: Awaited<ReturnType<typeof lostAnswerState>>) => s.logoutAll(st.accessToken)],
    [
      "a password change",
      async (st: Awaited<ReturnType<typeof lostAnswerState>>) =>
        s
          .api()
          .put("/api/v1/users/me/password")
          .set(s.bearer(st.accessToken))
          .send({ currentPassword: st.password, newPassword: testPassword() }),
    ],
    [
      "a password reset",
      async (st: Awaited<ReturnType<typeof lostAnswerState>>) =>
        s
          .api()
          .post("/api/v1/auth/reset-password")
          .send({ token: await s.mailedResetToken(st.email), newPassword: testPassword() }),
    ],
    [
      "account deletion",
      async (st: Awaited<ReturnType<typeof lostAnswerState>>) =>
        s.api().delete("/api/v1/users/me").set(s.bearer(st.accessToken)).send({ password: st.password }),
    ],
  ])("7. %s with superseded rows present (fails today) ends every row", async (_label, kill) => {
    const st = await lostAnswerState(); // today: the second renewal of P is refused
    expect((await kill(st)).status).toBe(204);
    expect(await s.countOf(st.user.id)).toBe(0);
    for (const token of [st.P, st.H, st.H2]) await expectRefused(token);
  });

  it("12. the owner signing out with a token a thief's renewal deleted ends the thief's session too", async () => {
    const { user, refreshToken: P } = await s.signedUp();
    const H = (await renewed(P)).refreshToken;
    const ownerToken = (await renewed(H)).refreshToken; // the owner renews H and holds H'
    const T = (await renewed(H)).refreshToken; // the thief renews a copy of H: a sibling of H'
    const thiefNext = (await renewed(T)).refreshToken; // which deletes H and the owner's H'
    warn.mockClear();

    expect((await s.logout(ownerToken)).status).toBe(204); // the owner taps Sign out with H'

    expect(reuseLines(warn)).toHaveLength(1);
    expect(await s.countOf(user.id)).toBe(0);
    await expectRefused(thiefNext); // before: the thief kept renewing
  });

  it("12. sign out with a dead token of an ended family ends nothing (guard)", async () => {
    const { email, password, refreshToken: P } = await s.signedUp();
    const other = ((await s.login(email, password)).body as Grant).refreshToken;
    expect((await s.logout(P)).status).toBe(204);
    warn.mockClear();

    expect((await s.logout(P)).status).toBe(204);

    expect(reuseLines(warn)).toEqual([]);
    await renewed(other);
  });

  it("13. the cap evicts the oldest sibling (fails today), which then counts as reuse", async () => {
    const { MAX_UNUSED_SUCCESSORS } = await import("../../lib/sessions.js");
    const { user, refreshToken: P } = await s.signedUp();
    const first = (await renewed(P)).refreshToken;
    for (let i = 0; i < 6; i++) await renewed(P); // today: the first of these is refused

    expect((await s.rowsOf(user.id)).live).toBe(MAX_UNUSED_SUCCESSORS);
    expect(await s.stored(first)).toBe(false);

    warn.mockClear();
    await expectRefused(first);
    expect(reuseLines(warn)).toHaveLength(1);
    expect(await s.countOf(user.id)).toBe(0);
  });

  it("15. a row expired by the database clock is refused and deleted while its JWT is still valid (guard)", async () => {
    const { user, refreshToken: P } = await s.signedUp();
    await suite.client.query(
      "UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [hashOf(P)],
    );

    await expectRefused(P);

    expect(await s.countOf(user.id)).toBe(0);
  });

  it("a renewal for a deleted user is refused (guard)", async () => {
    const { user, refreshToken } = await s.signedUp();
    // Deleted past the API, so the JWT is still valid and only the user row is gone.
    await suite.client.query("SET session_replication_role = replica");
    try {
      await suite.client.query("DELETE FROM users WHERE id = $1", [user.id]);
    } finally {
      await suite.client.query("SET session_replication_role = DEFAULT");
    }

    await expectRefused(refreshToken);
  });

  it("an expired superseded row is refused and deleted, and its live siblings still renew (guard)", async () => {
    const { user, refreshToken: P } = await s.signedUp();
    const H1 = (await renewed(P)).refreshToken;
    const H2 = (await renewed(P)).refreshToken;
    await suite.client.query(
      "UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [hashOf(P)],
    );

    await expectRefused(P);
    expect(await s.stored(P)).toBe(false);
    expect(await s.rowsOf(user.id)).toEqual({ total: 2, live: 2, superseded: 0 });

    // The family has live rows and no superseded row: they are still siblings.
    const next = (await renewed(H2)).refreshToken;
    expect(await s.stored(H1)).toBe(false);
    await renewed(next);
  });
});
