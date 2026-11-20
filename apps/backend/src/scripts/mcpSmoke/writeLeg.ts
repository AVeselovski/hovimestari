import type { Client } from "@modelcontextprotocol/client";
import { randomBytes, randomUUID } from "node:crypto";
import { READ_TOOL_NAMES, same, WRITE_TOOL_NAMES, type Json } from "./checks.js";

// The write leg of the smoke check (design g.1): a read-and-write key made
// through POST /connections lists every tool, logs one food through
// log_food, and the same body posted to POST /entries must give the same
// entry and the same day. The record must hold one row for the tool's
// change, by its id, and none for the screen's. A retry with the same
// request key must answer `replayed` and write nothing. Then a food made
// through create_own_food must equal GET /foods/:id, log through log_food,
// and leave two record rows, the food's and the entry's. The three changes
// must read back through GET /connections/:id/changes, two a page, and as
// the connection's count in GET /connections.

export interface SmokeSession {
  rest: (method: string, path: string, body?: unknown) => Promise<Json>;
  connect: (key: string) => Promise<Client>;
  /** The record rows of the smoke user, oldest first: action and entity ids. */
  recordRows: () => Promise<{ action: string; entityIds: string[] }[]>;
  callOn: (client: Client, name: string, args: Record<string, unknown>) => Promise<Json>;
}

export async function writeLeg(s: SmokeSession, foodId: string, today: string): Promise<string> {
  console.log("\n== write leg");
  const created = await s.rest("POST", "/connections", {
    name: "MCP smoke, writing",
    access: "read_write",
    expiresInDays: 7,
  });
  const client = await s.connect(created.key);
  try {
    same(
      "write key tools",
      (await client.listTools()).tools.map((t) => t.name),
      [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES],
    );

    const amount = { grams: 135 };
    const requestKey = `smoke_${randomBytes(9).toString("base64url")}`;
    const before = (await s.recordRows()).length;
    const tool = await s.callOn(client, "log_food", { requestKey, foodId, amount, date: today, status: "eaten" });
    same("log_food outcome", tool.outcome, "created");
    same("log_food day = GET /days/:date", tool.days, [await s.rest("GET", `/days/${today}`)]);

    const rest = await s.rest("POST", "/entries", {
      kind: "food",
      id: randomUUID(),
      foodId,
      amount,
      date: today,
      status: "eaten",
    });
    const fields = (e: Json) => [e.kind, e.date, e.status, e.name, e.grams, e.figures, e.isEstimate];
    same("log_food entry = POST /entries entry", fields(tool.entry), fields(rest.entry));
    same("get_day after both = POST /entries day", await s.callOn(client, "get_day", { date: today }), rest.days[0]);

    const rows = await s.recordRows();
    same("one record row for the tool, none for the screen", rows.length, before + 1);
    same("the record row", rows.at(-1), { action: "entry.added", entityIds: [tool.entry.id] });

    const again = await s.callOn(client, "log_food", { requestKey, foodId, amount, date: today, status: "eaten" });
    same("a retry replays", [again.outcome, again.entry?.id], ["replayed", tool.entry.id]);
    same("a retry records nothing", (await s.recordRows()).length, before + 1);

    // A food made through create_own_food, then logged through log_food: two
    // record rows, the food's and the entry's.
    const made = await s.callOn(client, "create_own_food", {
      requestKey: `smoke_${randomBytes(9).toString("base64url")}`,
      name: "Smoke leipä",
      per100g: { energyKcal: 250, proteinG: 9, carbsG: 45, fatG: 3 },
    });
    same("create_own_food outcome", made.outcome, "created");
    same("create_own_food food = GET /foods/:id", made.food, await s.rest("GET", `/foods/${made.food.id}`));
    const logged = await s.callOn(client, "log_food", {
      requestKey: `smoke_${randomBytes(9).toString("base64url")}`,
      foodId: made.food.id,
      amount: { grams: 80 },
      date: today,
      status: "planned",
    });
    same("log_food of the new food", [logged.outcome, logged.entry.name], ["created", "Smoke leipä"]);
    same("the two record rows", (await s.recordRows()).slice(before + 1), [
      { action: "food.created", entityIds: [made.food.id] },
      { action: "entry.added", entityIds: [logged.entry.id] },
    ]);

    // The record as Settings reads it: the three changes, newest first, two
    // a page, the count on the connection, and nothing a replay reads.
    const id = created.connection.id as string;
    const first = await s.rest("GET", `/connections/${id}/changes?limit=2`);
    const second = await s.rest("GET", `/connections/${id}/changes?limit=2&cursor=${first.nextCursor}`);
    const lines = (page: Json) =>
      page.changes.map((c: Json) => [c.action, c.summary.entry?.name ?? c.summary.name, c.connectionName]);
    same(
      "GET /connections/:id/changes, newest first, by cursor",
      [...lines(first), ...lines(second)],
      [
        ["entry.added", "Smoke leipä", "MCP smoke, writing"],
        ["food.created", "Smoke leipä", "MCP smoke, writing"],
        ["entry.added", tool.entry.name, "MCP smoke, writing"],
      ],
    );
    same("the last page has no cursor", second.nextCursor, null);
    same("a change's fields", Object.keys(first.changes[0]).sort(), [
      "action",
      "at",
      "connectionName",
      "deletionStatus",
      "id",
      "summary",
    ]);
    const listed = (await s.rest("GET", "/connections")).connections.find((c: Json) => c.id === id);
    same("GET /connections counts the changes", listed?.changeCount, 3);
  } finally {
    await client.close();
  }
  return created.connection.id as string;
}
