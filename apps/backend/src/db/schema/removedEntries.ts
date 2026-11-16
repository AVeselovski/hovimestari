import { index, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/** How long a removed entry can be restored, and refuses a late retry of its add. */
export const RESTORE_WINDOW_MS = 10 * 60 * 1000;

/**
 * A removed entry, kept ten minutes for an exact undo and to refuse a late
 * retry of its add. `row` is the entry's full row as `to_jsonb` writes it,
 * keyed by column name, and a restore puts it back with
 * `jsonb_populate_record`, so every column returns exactly as it was.
 */
export const removedEntries = pgTable(
  "removed_entries",
  {
    // The entry's id.
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    row: jsonb("row").$type<Record<string, unknown>>().notNull(),
    removedAt: timestamp("removed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("removed_entries_user_removed_idx").on(t.userId, t.removedAt)],
);
