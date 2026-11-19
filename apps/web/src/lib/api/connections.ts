import { api, type RequestOptions } from "@/lib/api";
import type { ConnectionList, CreateConnectionBody, CreatedConnection } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// Connections: the keys a user gives their own AI assistant (Settings,
// Connected AI). Only `createConnection`'s answer ever holds a key, and its
// caller hands it straight to the reveal store (ConnectionRevealProvider).
// ---------------------------------------------------------------------------

/** `GET /connections`: the user's live and expired connections, newest first, and what the server offers now. Never a key. */
export async function getConnections(req?: RequestOptions): Promise<ConnectionList> {
  const res = await api.get<ConnectionList>("/connections", { signal: req?.signal });
  return res.data;
}

/** `POST /connections`: makes a key. The answer is the only one that ever carries it. */
export async function createConnection(body: CreateConnectionBody): Promise<CreatedConnection> {
  const res = await api.post<CreatedConnection>("/connections", body);
  return res.data;
}

/** `DELETE /connections/:id`: revokes a key, or removes an expired one. The assistant loses access at once. */
export async function revokeConnection(id: string): Promise<void> {
  await api.delete(`/connections/${encodeURIComponent(id)}`);
}
