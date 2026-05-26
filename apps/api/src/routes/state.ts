import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { StateSchema } from "@hovi/shared";
import { pool } from "../db/pool.js";

// updatedAt is an opaque round-trip token (Postgres's ::text rendering of
// updated_at). Don't constrain its format — that's the server's contract,
// not the client's to validate.
const PutBodySchema = z.object({
  state: StateSchema,
  updatedAt: z.string().min(1),
});

export async function stateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async () => ({ ok: true }));

  // updated_at is returned as ::text rather than as a Date so the round-trip
  // preserves Postgres's microsecond precision. JS Date is ms-precision, so
  // toISOString() would truncate and the optimistic-lock equality check on
  // PUT would never match.
  app.get("/state", async (_req, reply) => {
    const { rows } = await pool.query<{ state: unknown; updated_at: string }>(
      "SELECT state, updated_at::text AS updated_at FROM household_state WHERE id = 1",
    );
    if (rows.length === 0) {
      reply.code(500);
      return { error: "household_state row missing" };
    }
    const row = rows[0];
    return { state: row.state, updatedAt: row.updated_at };
  });

  app.put("/state", async (req, reply) => {
    const parsed = PutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid body", issues: parsed.error.issues };
    }
    const { state, updatedAt } = parsed.data;

    const result = await pool.query<{ updated_at: string }>(
      `UPDATE household_state
         SET state = $1::jsonb, updated_at = now()
       WHERE id = 1 AND updated_at = $2::timestamptz
       RETURNING updated_at::text AS updated_at`,
      [JSON.stringify(state), updatedAt],
    );

    if (result.rowCount === 0) {
      const current = await pool.query<{ state: unknown; updated_at: string }>(
        "SELECT state, updated_at::text AS updated_at FROM household_state WHERE id = 1",
      );
      reply.code(409);
      const row = current.rows[0];
      return {
        error: "conflict",
        state: row?.state,
        updatedAt: row?.updated_at,
      };
    }

    return { updatedAt: result.rows[0].updated_at };
  });
}
