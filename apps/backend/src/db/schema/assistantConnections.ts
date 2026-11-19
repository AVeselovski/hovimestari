import type { ConnectionAccess } from "@hovimestari/types";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * A connection: a key the user gave to their own AI assistant. Only the hash
 * of the key is stored. A row is never deleted while its user lives: a
 * revoked one stays, so what it did keeps its connection.
 */
export const assistantConnections = pgTable(
  "assistant_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The user's label, such as "Claude on my laptop". 1 to 64 characters, by CHECK. */
    name: text("name").notNull(),
    /** sha256(key) hex, the only form of the key stored. */
    keyHash: text("key_hash").notNull().unique(),
    /** Text plus CHECK, not an enum, so a later value is an ALTER inside the migrator's transaction. */
    access: text("access").$type<ConnectionAccess>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Written at most once per 5 minutes (lib/connectionKeys.ts touchLastUsed). */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assistant_connections_user_idx").on(t.userId, t.createdAt.desc()),
    check("assistant_connections_name_len", sql`char_length(${t.name}) BETWEEN 1 AND 64`),
    check("assistant_connections_access", sql`${t.access} IN ('read', 'read_write')`),
  ],
);
