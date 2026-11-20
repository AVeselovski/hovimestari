import { AssistantChangePageSchema } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import { insertChange, insertChanges, insertConnection } from "../../__tests__/support/changeRows.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// One connection's record of changes under GET /connections/:id/changes, on a
// real Postgres: pages by cursor, newest first, a cursor the route did not
// issue refused, and another person's connection answered as a missing one.
// Record rows are inserted with their times written out, so no test reads
// the machine's clock or date, and rows can share one microsecond.

type Page = { changes: { id: string; summary: { name: string } }[]; nextCursor: string | null };

await describeWithDb("connection changes", (suite) => {
  const api = () => request(suite.app);
  const changesOf = (user: ApiUser, connectionId: string, query: Record<string, string | number> = {}) =>
    api().get(`/api/v1/connections/${connectionId}/changes`).query(query).set(user.auth);

  /** Every page from the newest, following each nextCursor, at `limit` a page. */
  async function allPages(user: ApiUser, connectionId: string, limit: number): Promise<Page[]> {
    const pages: Page[] = [];
    let cursor: string | null | undefined;
    do {
      const res = await changesOf(user, connectionId, cursor ? { limit, cursor } : { limit });
      expect(res.status).toBe(200);
      pages.push(res.body as Page);
      cursor = (res.body as Page).nextCursor;
    } while (cursor);
    return pages;
  }

  const idsOf = (page: Page) => page.changes.map((c) => c.id);

  async function personWithRecord(n: number) {
    const user = await signUp(suite.client);
    const connectionId = await insertConnection(suite.client, user.id, "Claude on my laptop");
    const ids = await insertChanges(suite.client, user.id, connectionId, n);
    return { user, connectionId, newestFirst: [...ids].reverse() };
  }

  describe("paging", () => {
    it("answers a change as the screen reads it, and nothing a replay reads", async () => {
      const user = await signUp(suite.client);
      const connectionId = await insertConnection(suite.client, user.id, "Claude on my laptop");
      const id = await insertChange(suite.client, user.id, connectionId, {
        at: "2026-11-18 14:32:05.123456+00",
        name: "<b>Rahka</b>; DROP TABLE foods",
      });

      const res = await changesOf(user, connectionId);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        changes: [
          {
            id,
            action: "favourite.set",
            at: "2026-11-18T14:32:05.123Z",
            connectionName: "Claude on my laptop",
            // A name is data, answered exactly as stored.
            summary: { entity: "food", name: "<b>Rahka</b>; DROP TABLE foods", changes: [] },
            deletionStatus: null,
          },
        ],
        nextCursor: null,
      });
      expect(AssistantChangePageSchema.strict().parse(res.body)).toEqual(res.body);
    });

    it("pages newest first by cursor: each change once, and no cursor after the last page", async () => {
      const { user, connectionId, newestFirst } = await personWithRecord(5);

      const pages = await allPages(user, connectionId, 2);

      expect(pages.map(idsOf)).toEqual([newestFirst.slice(0, 2), newestFirst.slice(2, 4), newestFirst.slice(4)]);
      expect(pages.at(-1)!.nextCursor).toBeNull();
    });

    it("answers no cursor when the last page is exactly full", async () => {
      const { user, connectionId, newestFirst } = await personWithRecord(4);

      const pages = await allPages(user, connectionId, 2);

      expect(pages.map(idsOf)).toEqual([newestFirst.slice(0, 2), newestFirst.slice(2)]);
    });

    it("pages through changes that share one time, by id, with none twice and none skipped", async () => {
      const user = await signUp(suite.client);
      const connectionId = await insertConnection(suite.client, user.id, "Batch");
      const at = "2026-11-18 12:00:00.000001+00";
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) ids.push(await insertChange(suite.client, user.id, connectionId, { at }));
      // One older and one newer around them, so the boundary sits inside the tie.
      const older = await insertChange(suite.client, user.id, connectionId, { at: "2026-11-18 12:00:00+00" });
      const newer = await insertChange(suite.client, user.id, connectionId, { at: "2026-11-18 12:00:00.000002+00" });

      const pages = await allPages(user, connectionId, 2);

      const tied = [...ids].sort().reverse();
      expect(pages.flatMap(idsOf)).toEqual([newer, ...tied, older]);
    });

    it("keeps its place when changes land between two page reads", async () => {
      const { user, connectionId, newestFirst } = await personWithRecord(4);
      const first = (await changesOf(user, connectionId, { limit: 2 })).body as Page;

      // Two changes land after the first page was read, newer than everything.
      const landed = [
        await insertChange(suite.client, user.id, connectionId, { at: "2026-11-19 09:00:00+00" }),
        await insertChange(suite.client, user.id, connectionId, { at: "2026-11-19 09:01:00+00" }),
      ];
      const second = (await changesOf(user, connectionId, { limit: 2, cursor: first.nextCursor! })).body as Page;

      expect(idsOf(first)).toEqual(newestFirst.slice(0, 2));
      expect(idsOf(second)).toEqual(newestFirst.slice(2));
      expect(second.nextCursor).toBeNull();
      // A fresh read starts with them.
      const fresh = (await changesOf(user, connectionId, { limit: 2 })).body as Page;
      expect(idsOf(fresh)).toEqual([...landed].reverse());
    });

    it("answers 50 a page by default and at most 100", async () => {
      const { user, connectionId, newestFirst } = await personWithRecord(101);

      const first = (await changesOf(user, connectionId)).body as Page;
      expect(idsOf(first)).toEqual(newestFirst.slice(0, 50));
      expect(first.nextCursor).not.toBeNull();

      const most = (await changesOf(user, connectionId, { limit: 100 })).body as Page;
      expect(idsOf(most)).toEqual(newestFirst.slice(0, 100));

      for (const limit of [0, 101, -1, 2.5, "ten"]) {
        const res = await changesOf(user, connectionId, { limit });
        expect([limit, res.status, res.body.code]).toEqual([limit, 400, "invalid_request"]);
      }
    });

    it("answers an empty page for a connection that changed nothing", async () => {
      const user = await signUp(suite.client);
      const connectionId = await insertConnection(suite.client, user.id, "Quiet");

      expect((await changesOf(user, connectionId)).body).toEqual({ changes: [], nextCursor: null });
    });
  });

  describe("cursors", () => {
    it("is 22 characters of base64url: the place on the record and nothing else", async () => {
      const { user, connectionId } = await personWithRecord(3);

      const { nextCursor } = (await changesOf(user, connectionId, { limit: 1 })).body as Page;

      expect(nextCursor).toMatch(/^[A-Za-z0-9_-]{22}$/);
    });

    it("refuses a cursor it did not issue, 400, and guesses no place", async () => {
      const { user, connectionId } = await personWithRecord(3);
      const { nextCursor } = (await changesOf(user, connectionId, { limit: 1 })).body as Page;
      // The same connection's other person, and this person's other connection.
      const otherConnection = await insertConnection(suite.client, user.id, "Other");
      const [otherChange] = await insertChanges(suite.client, user.id, otherConnection, 1);
      const { cursorOf } = await import("../../services/reads/changeRecord.js");
      // The issued cursor with its last character's spare bits set: the same bytes, written another way.
      const lastChar = nextCursor!.at(-1)!;
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
      const respelt = nextCursor!.slice(0, -1) + alphabet[alphabet.indexOf(lastChar) + 1];

      for (const cursor of [
        "",
        "abc",
        "not a cursor at all, with spaces",
        respelt,
        `${nextCursor}A`,
        cursorOf(randomUUID()),
        cursorOf(otherChange),
      ]) {
        const res = await changesOf(user, connectionId, { cursor });
        expect([cursor, res.status, res.body.code]).toEqual([cursor, 400, "invalid_request"]);
      }
      // The issued one still reads.
      expect((await changesOf(user, connectionId, { cursor: nextCursor! })).status).toBe(200);
    });

    it("refuses another person's cursor on their own connection's record", async () => {
      const mine = await personWithRecord(2);
      const theirs = await personWithRecord(3);
      const { nextCursor } = (await changesOf(theirs.user, theirs.connectionId, { limit: 1 })).body as Page;

      const res = await changesOf(mine.user, mine.connectionId, { cursor: nextCursor! });

      expect([res.status, res.body.code]).toEqual([400, "invalid_request"]);
    });
  });

  describe("who reads it", () => {
    it("answers another person's connection exactly as a missing one, cursor or not", async () => {
      const mine = await personWithRecord(1);
      const theirs = await personWithRecord(3);
      const { nextCursor } = (await changesOf(theirs.user, theirs.connectionId, { limit: 1 })).body as Page;

      const answers = await Promise.all([
        changesOf(mine.user, theirs.connectionId),
        changesOf(mine.user, theirs.connectionId, { cursor: nextCursor! }),
        changesOf(mine.user, theirs.connectionId, { cursor: "abc" }),
        changesOf(mine.user, randomUUID()),
        changesOf(mine.user, "not-a-uuid"),
      ]);

      for (const res of answers) {
        expect([res.status, res.body]).toEqual([404, { code: "connection_not_found", message: expect.any(String) }]);
      }
      expect(new Set(answers.map((res) => JSON.stringify(res.body))).size).toBe(1);
    });

    it("keeps a revoked connection's record readable by its owner", async () => {
      const user = await signUp(suite.client);
      const connectionId = await insertConnection(suite.client, user.id, "Old laptop", { revoked: true });
      const [id] = await insertChanges(suite.client, user.id, connectionId, 1);

      const res = await changesOf(user, connectionId);

      expect([res.status, idsOf(res.body as Page)]).toEqual([200, [id]]);
    });

    it("answers 401 without a session", async () => {
      const { connectionId } = await personWithRecord(1);

      const res = await api().get(`/api/v1/connections/${connectionId}/changes`);

      expect(res.status).toBe(401);
    });
  });
});
