import type { State } from "@hovi/shared";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

export type StateResponse = { state: State; updatedAt: string };

export async function getState(): Promise<StateResponse> {
  const res = await fetch(`${BASE}/state`);
  if (!res.ok) throw new Error(`GET /state failed: ${res.status}`);
  return (await res.json()) as StateResponse;
}

export type PutResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; state: State; updatedAt: string }
  | { ok: false; conflict: false; error: string };

export async function putState(
  state: State,
  updatedAt: string,
): Promise<PutResult> {
  const res = await fetch(`${BASE}/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, updatedAt }),
  });
  if (res.ok) {
    const body = (await res.json()) as { updatedAt: string };
    return { ok: true, updatedAt: body.updatedAt };
  }
  if (res.status === 409) {
    const body = (await res.json()) as { state: State; updatedAt: string };
    return { ok: false, conflict: true, state: body.state, updatedAt: body.updatedAt };
  }
  return { ok: false, conflict: false, error: `HTTP ${res.status}` };
}
