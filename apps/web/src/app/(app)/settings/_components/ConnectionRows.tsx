"use client";

import { btnTextDanger, focusRing, tagClass } from "@/components/ui/styles";
import type { Connection } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, type ReactElement } from "react";

interface ConnectionRowProps {
  connection: Connection;
  /** The server makes no key that can make changes now: a read-and-write row says it can only read. */
  writesOff: boolean;
  /** A moment as the day where the person is, in the device's language. */
  formatDay: (iso: string) => string;
  onRevoke: (connection: Connection, opener: HTMLElement) => void;
}

/**
 * One connection: its name and its access tag, then when it expires, or
 * that it expired and when, and when it was last used, then Revoke, or
 * Remove once it has expired. "Expired" is said once, on the date line. The tags are
 * neutral: an access level is a fact, not a choice or a status. A key that
 * can make changes keeps its tag while changes are switched off, and says it
 * can only read for now, because it gets its access back when they are on.
 *
 * The row takes focus when the person confirms they copied its new key, so
 * it is focusable by code and names itself by the connection's name.
 */
export function ConnectionRow({ connection, writesOff, formatDay, onRevoke }: ConnectionRowProps): ReactElement {
  const t = useTranslations("settings.connectedAi");
  const nameId = useId();
  const expired = connection.status === "expired";
  const write = connection.access === "read_write";

  return (
    <li
      tabIndex={-1}
      aria-labelledby={nameId}
      data-connection-id={connection.id}
      // The rule between rows is drawn, not a border: a border would follow the
      // rounded corners the focus ring needs. Scrolled into view after a new
      // key, the row keeps the gap Settings keeps above a target it scrolls to.
      className={`relative scroll-mt-4 rounded-control py-4 first:pt-0 last:pb-0 not-first:before:absolute not-first:before:inset-x-0 not-first:before:top-0 not-first:before:h-px not-first:before:bg-rule ${focusRing}`}
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
        <span>{connection.lastUsedAt ? t("lastUsed", { date: formatDay(connection.lastUsedAt) }) : t("notUsed")}</span>
      </p>
      {write && writesOff && <p className="mt-1 text-base text-ink">{t("writesOffRow")}</p>}
      <button
        type="button"
        // After a revoke focus moves to the same button in the next row (lib/focusAfterRemoval.ts).
        data-row-action="revoke"
        aria-label={expired ? t("removeNamed", { name: connection.name }) : t("revokeNamed", { name: connection.name })}
        onClick={(e) => onRevoke(connection, e.currentTarget)}
        className={`mt-1 ${btnTextDanger}`}
      >
        {expired ? t("remove") : t("revoke")}
      </button>
    </li>
  );
}
