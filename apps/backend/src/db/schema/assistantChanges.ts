import { ASSISTANT_CHANGE_ACTIONS, type AssistantChangeAction, type AssistantChangeSummary } from "@hovimestari/types";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { assistantConnections } from "./assistantConnections.js";
import { users } from "./users.js";

const ACTIONS = sql.raw(ASSISTANT_CHANGE_ACTIONS.map((action) => `'${action}'`).join(", "));

/**
 * The record of what a connected assistant changed: one row per write that
 * changed something, inserted in that write's own transaction, so a change
 * never exists without its row or a row without its change. The row also
 * holds the call's request key, so a retry lands once.
 */
export const assistantChanges = pgTable(
  "assistant_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => assistantConnections.id, { onDelete: "cascade" }),
    /** The connection's name when the change was made. */
    connectionName: text("connection_name").notNull(),
    /** Text plus CHECK, not an enum, so a later value is an ALTER inside the migrator's transaction. */
    action: text("action").$type<AssistantChangeAction>().notNull(),
    /**
     * The rows the write created or changed, in the order the action gives
     * them. A replay reads them as they are now. No foreign key: a row may be gone since.
     */
    entityIds: uuid("entity_ids").array().notNull(),
    /** What a person reads: names, dates, amounts and figures as the answer had them. */
    summary: jsonb("summary").$type<AssistantChangeSummary>().notNull(),
    requestKey: text("request_key").notNull(),
    /** sha256 of the tool's name and the call's other arguments, as canonical JSON. */
    requestHash: text("request_hash").notNull(),
    /** clock_timestamp(), the moment of the insert, so the order of changes is kept. */
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`clock_timestamp()`),
  },
  (t) => [
    uniqueIndex("assistant_changes_request_key_uq").on(t.connectionId, t.requestKey),
    /** One connection's record, newest first. */
    index("assistant_changes_connection_idx").on(t.connectionId, t.createdAt.desc(), t.id.desc()),
    /** The hourly brake, counted per user across every key. */
    index("assistant_changes_user_idx").on(t.userId, t.createdAt.desc()),
    check("assistant_changes_action", sql`${t.action} IN (${ACTIONS})`),
    check("assistant_changes_entity_ids", sql`cardinality(${t.entityIds}) >= 1`),
  ],
);
