import { expect } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import { randomBytes } from "node:crypto";
import type request from "supertest";
import { signUp, type ApiUser } from "../../__tests__/support/apiUser.js";
import type { DbSuite } from "../../db/__tests__/support/throwawayDb.js";

// What the write tool suites share, on a real database: a person in
// Helsinki with a read-and-write key made through POST /connections, a call
// that answers the tool's data or its refusal, and the person's record rows
// read straight from the table. Request keys are made per call, so no file
// holds one.

export const CONNECTION_NAME = "Claude Code, writing";

/** A fresh request key for one call. */
export const newRequestKey = (): string => `rk_${randomBytes(9).toString("base64url")}`;

export interface Writer {
  user: ApiUser;
  key: string;
  connectionId: string;
}

/** A person in Helsinki with a read-and-write key. Writing must be on when the suite's env loads. */
export async function writerWithKey(suite: DbSuite, api: () => ReturnType<typeof request>): Promise<Writer> {
  const user = await signUp(suite.client);
  await suite.client.query("UPDATE users SET time_zone = 'Europe/Helsinki' WHERE id = $1", [user.id]);
  const res = await api()
    .post("/api/v1/connections")
    .set(user.auth)
    .send({ name: CONNECTION_NAME, access: "read_write", expiresInDays: 30 });
  expect(res.status).toBe(201);
  return { user, key: res.body.key as string, connectionId: res.body.connection.id as string };
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

/** A tool's answer: its `data` when it answered, its text when it refused. */
export interface Called {
  isError: boolean;
  text: string;
  // The parsed data of a tool's answer: each test reads the fields of its tool.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Called> {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = result.content[0].text;
  if (result.isError) return { isError: true, text, data: undefined };
  return { isError: false, text, data: (JSON.parse(text) as { data: unknown }).data };
}

/** A tool's data, failing loudly on a refusal. */
export async function written(client: Client, name: string, args: Record<string, unknown>) {
  const answer = await call(client, name, args);
  if (answer.isError) throw new Error(`${name} refused: ${answer.text}`);
  return answer.data;
}

export interface RecordRow {
  action: string;
  entityIds: string[];
  summary: Record<string, unknown>;
  requestKey: string;
  connectionId: string;
  connectionName: string;
}

/** The person's record rows, oldest first. */
export async function recordsOf(suite: DbSuite, userId: string): Promise<RecordRow[]> {
  const { rows } = await suite.client.query(
    `SELECT action, entity_ids::text[] AS "entityIds", summary, request_key AS "requestKey",
            connection_id AS "connectionId", connection_name AS "connectionName"
       FROM assistant_changes WHERE user_id = $1 ORDER BY created_at, id`,
    [userId],
  );
  return rows as RecordRow[];
}
