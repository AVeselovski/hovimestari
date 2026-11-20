"use client";

import { btnText, btnTextDanger, focusRing, tagClass } from "@/components/ui/styles";
import type { Connection, ConnectionWithChanges, PastConnection } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, type ReactElement } from "react";
import type { ActivityTarget } from "./ConnectionActivitySheet";

/** A row's rule between it and the row above, drawn so the focus ring keeps its rounded corners. */
const rowClass = `relative rounded-control py-4 first:pt-0 last:pb-0 not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-rule ${focusRing}`;

interface ConnectionRowProps {
  connection: ConnectionWithChanges;
  /** The server makes no key that can make changes now: a read-and-write row says it can only read. */
  writesOff: boolean;
  /** A moment as the day where the person is, in the device's language. */
  formatDay: (iso: string) => string;
  onRevoke: (connection: Connection, opener: HTMLElement) => void;
  /** Opens the record of what the connection changed. */
  onActivity: (connection: ActivityTarget, opener: HTMLElement) => void;
}

/**
 * One connection: its name and its access tag, then when it expires, or
 * that it expired and when, and when it was last used, then Revoke, or
 * Remove once it has expired. A key that can make changes also says how many
 * it made and offers Activity, its record. A read-only key makes none, so it
 * says nothing about changes. "Expired" is said once, on the date line. The tags are
 * neutral: an access level is a fact, not a choice or a status. A key that
 * can make changes keeps its tag while changes are switched off, and says it
 * can only read for now, because it gets its access back when they are on.
 *
 * The row takes focus when the person confirms they copied its new key, so
 * it is focusable by code and names itself by the connection's name.
 */
export function ConnectionRow({
  connection,
  writesOff,
  formatDay,
  onRevoke,
  onActivity,
}: ConnectionRowProps): ReactElement {
  const t = useTranslations("settings.connectedAi");
  const nameId = useId();
  const expired = connection.status === "expired";
  const write = connection.access === "read_write";

  return (
    <li
      tabIndex={-1}
      aria-labelledby={nameId}
      data-connection-id={connection.id}
      // Scrolled into view after a new key, the row keeps the gap Settings
      // keeps above a target it scrolls to.
      className={`scroll-mt-4 ${rowClass}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <h3 id={nameId} className="min-w-0 text-lg font-semibold break-words text-ink">
          {connection.name}
        </h3>
        <span className={tagClass}>{write ? t("accessReadWrite") : t("accessRead")}</span>
      </div>
      <p className="mt-1 flex flex-col text-base text-ink-muted md:flex-row md:flex-wrap md:gap-x-1.5">
        <span className="inline-flex gap-x-1.5">
          <span>
            {expired
              ? t("expiredOn", { date: formatDay(connection.expiresAt) })
              : t("expiresOn", { date: formatDay(connection.expiresAt) })}
          </span>
          <span aria-hidden="true" className="hidden md:inline">
            ·
          </span>
        </span>
        <span className="inline-flex gap-x-1.5">
          <span>
            {connection.lastUsedAt ? t("lastUsed", { date: formatDay(connection.lastUsedAt) }) : t("notUsed")}
          </span>
          {write && (
            <span aria-hidden="true" className="hidden md:inline">
              ·
            </span>
          )}
        </span>
        {write && <span>{t("changeCount", { count: connection.changeCount })}</span>}
      </p>
      {write && writesOff && <p className="mt-1 text-base text-ink">{t("writesOffRow")}</p>}
      <div className="mt-1 flex flex-wrap gap-x-6">
        {write && <ActivityButton name={connection.name} onPress={(opener) => onActivity(connection, opener)} />}
        <button
          type="button"
          // After a revoke focus moves to the same button in the next row (lib/focusAfterRemoval.ts).
          data-row-action="revoke"
          aria-label={
            expired ? t("removeNamed", { name: connection.name }) : t("revokeNamed", { name: connection.name })
          }
          onClick={(e) => onRevoke(connection, e.currentTarget)}
          className={btnTextDanger}
        >
          {expired ? t("remove") : t("revoke")}
        </button>
      </div>
    </li>
  );
}

/** Activity: opens the record of what a connection changed. Named by the connection, as Revoke is. */
function ActivityButton({ name, onPress }: { name: string; onPress: (opener: HTMLElement) => void }): ReactElement {
  const t = useTranslations("settings.connectedAi");
  return (
    <button
      type="button"
      aria-label={t("activityNamed", { name })}
      onClick={(e) => onPress(e.currentTarget)}
      className={btnText}
    >
      {t("activity")}
    </button>
  );
}

interface PastConnectionRowProps {
  connection: PastConnection;
  formatDay: (iso: string) => string;
  onActivity: (connection: ActivityTarget, opener: HTMLElement) => void;
}

/**
 * A revoked connection that made changes, under Past connections: its name,
 * how many changes it made and when the last one was, and Activity. The key
 * no longer works, so there is nothing to revoke and nothing to set up.
 */
export function PastConnectionRow({ connection, formatDay, onActivity }: PastConnectionRowProps): ReactElement {
  const t = useTranslations("settings.connectedAi");
  const nameId = useId();
  return (
    <li aria-labelledby={nameId} data-past-connection-id={connection.id} className={rowClass}>
      <h4 id={nameId} className="min-w-0 text-lg font-semibold wrap-anywhere text-ink">
        {connection.name}
      </h4>
      <p className="mt-1 flex flex-col text-base text-ink-muted md:flex-row md:flex-wrap md:gap-x-1.5">
        <span className="inline-flex gap-x-1.5">
          <span>{t("changeCount", { count: connection.changeCount })}</span>
          <span aria-hidden="true" className="hidden md:inline">
            ·
          </span>
        </span>
        <span>{t("lastChange", { date: formatDay(connection.lastChangeAt) })}</span>
      </p>
      <div className="mt-1 flex">
        <ActivityButton name={connection.name} onPress={(opener) => onActivity(connection, opener)} />
      </div>
    </li>
  );
}
