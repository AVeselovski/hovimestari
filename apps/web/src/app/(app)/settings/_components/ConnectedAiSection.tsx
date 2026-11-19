"use client";

import { useConnectionReveal } from "@/components/ConnectionRevealProvider";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui/Card";
import { btnPrimary, btnSecondary, listLine, listLineFrame } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useConfirmedDelete } from "@/hooks/useConfirmedDelete";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { revokeConnection } from "@/lib/api/connections";
import { getErrorCode } from "@/lib/errors";
import { afterConnectionCreated, afterConnectionRevoked } from "@/lib/invalidation";
import { restoreFocus } from "@/lib/lastInputModality";
import { formatMomentDay } from "@/lib/localDate";
import { mcpServerUrl } from "@/lib/mcpConnection";
import { connectionsQuery } from "@/lib/queryOptions";
import { MAX_LIVE_CONNECTIONS, type Connection } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { ConnectionInstructions } from "./ConnectionInstructions";
import { ConnectionRow } from "./ConnectionRows";
import { CreateConnectionSheet } from "./CreateConnectionSheet";
import { KeyRevealSheet } from "./KeyRevealSheet";

/** A connection's row in the list, by its id. */
function rowIn(list: HTMLElement | null, id: string): HTMLElement | null {
  return list?.querySelector<HTMLElement>(`[data-connection-id="${CSS.escape(id)}"]`) ?? null;
}

/**
 * "Connected AI" in Settings: the person's connections, a way to make one,
 * and how to set an assistant up. The one mount of the key reveal.
 *
 * The list also says what the server offers now. While connecting is off,
 * a line under the intro says no assistant can connect and no key works,
 * the rows still show with their Revoke, and neither Connect an assistant
 * nor How to connect is offered. At the limit of live keys a line takes the
 * place of Connect an assistant. While writing is off, the intro speaks of
 * reading only and the create form offers read only.
 *
 * A new key never lives here. The create sheet hands it to the reveal store
 * (`ConnectionRevealProvider`), which sits above every tab, and the reveal
 * opens whenever the store holds one.
 */
export function ConnectedAiSection(): ReactElement {
  const t = useTranslations("settings.connectedAi");
  const { status, user } = useAuth();
  const queryClient = useQueryClient();
  const list = useQuery({ ...connectionsQuery(), enabled: status === "authenticated" });
  const data = list.data;
  const { reveal, confirm } = useConnectionReveal();
  const headingId = useId();
  const howToId = useId();
  const howToButtonId = useId();

  const createSheet = useSheetTarget();
  const connectRef = useRef<HTMLButtonElement>(null);
  const howToRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [howToOpen, setHowToOpen] = useState(false);
  // The new row's connection, from "I have copied it" until its row has focus and is in view.
  const [focusRow, setFocusRow] = useState<string | null>(null);
  // Try again was pressed and its read is out. A read with no data starts
  // again as pending, so the failed state is held here, and the line and the
  // button stay where they are until the answer.
  const [retrying, setRetrying] = useState(false);

  function retry(): void {
    if (retrying) return;
    setRetrying(true);
    void list.refetch().finally(() => setRetrying(false));
  }

  const url = mcpServerUrl();
  const formatDay = (iso: string): string => formatMomentDay(iso, user?.timeZone);
  // The section's own action, for focus when no row is left to take it.
  const sectionAction = (): HTMLElement | null => connectRef.current ?? howToRef.current;

  const revoke = useConfirmedDelete<Connection>({
    copy: (c) => {
      const expired = c.status === "expired";
      return expired
        ? {
            title: t("removeTitle", { name: c.name }),
            message: t("removeBody"),
            confirmLabel: t("remove"),
            busyLabel: t("removing"),
          }
        : {
            title: t("revokeTitle", { name: c.name }),
            message: t("revokeBody"),
            note: c.access === "read_write" ? t("revokeWriteNote") : null,
            confirmLabel: t("revoke"),
            busyLabel: t("revoking"),
          };
    },
    // A second revoke answers 404: the key is gone either way, so it is done.
    run: async (c) => {
      try {
        await revokeConnection(c.id);
      } catch (err) {
        if (getErrorCode(err) !== "connection_not_found") throw err;
      }
    },
    errorText: (_err, c) => (c.status === "expired" ? t("removeFailed") : t("revokeFailed")),
    onDone: (_result, c) => {
      void afterConnectionRevoked(queryClient, c.id);
    },
    focusFallback: sectionAction,
  });

  function handleRevealDone(): void {
    if (!reveal) return;
    // The list is left alone while the reveal is up. Its new row goes into
    // the cache now. The render that closes the reveal reads the cache, so
    // the row is in the list in that same commit, and the effect below
    // gives it focus. The reveal itself returns focus nowhere, so focus goes
    // straight from "I have copied it" to the row.
    void afterConnectionCreated(queryClient, reveal.connection);
    setFocusRow(reveal.connection.id);
    confirm();
  }

  // Once the reveal has closed, the new row has focus and is in view. This
  // runs after the sheet has let go of the page, so the scroll it puts back
  // is not undone, and the row may sit above or below what shows. If the
  // list is not there yet (Settings opened again with the key still held),
  // it waits for the list. If no row comes (revoked on another device
  // meanwhile), focus goes to the section's own action.
  useEffect(() => {
    if (reveal !== null || focusRow === null) return;
    if (!data) {
      // The read failed: the section shows Try again, and no row is coming.
      if (list.isError && !list.isFetching) setFocusRow(null);
      return;
    }
    const row = rowIn(listRef.current, focusRow);
    if (row) {
      if (document.activeElement !== row) restoreFocus(row);
      row.scrollIntoView({ block: "nearest" });
      setFocusRow(null);
    } else if (!list.isFetching) {
      restoreFocus(connectRef.current ?? howToRef.current);
      setFocusRow(null);
    }
  }, [reveal, focusRow, data, list.isError, list.isFetching]);

  const write = data?.availability.write ?? false;
  const connectOn = data?.availability.connect ?? false;
  const live = data ? data.connections.filter((c) => c.status === "active").length : 0;
  const atLimit = live >= MAX_LIVE_CONNECTIONS;

  let body: ReactElement;
  if (data) {
    body =
      data.connections.length === 0 ? (
        <p className={listLine}>{t("empty")}</p>
      ) : (
        <ul ref={listRef}>
          {data.connections.map((c) => (
            <ConnectionRow
              key={c.id}
              connection={c}
              writesOff={!data.availability.write}
              formatDay={formatDay}
              onRevoke={revoke.open}
            />
          ))}
        </ul>
      );
  } else if (status === "authenticated" && list.fetchStatus === "fetching" && !retrying) {
    // One empty line's room while the list loads, so a short list moves nothing when it lands.
    body = <div className={listLineFrame} />;
  } else {
    body = (
      <>
        <p className={listLine}>{t("unavailable")}</p>
        {status === "authenticated" && (
          <div className="mt-3 grid md:flex">
            <button
              type="button"
              // Stays where it is while it asks again, so a second press does nothing new.
              aria-disabled={retrying || undefined}
              onClick={retry}
              className={btnSecondary}
            >
              {t("retry")}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <Card labelledBy={headingId}>
      <Card.Header id={headingId} title={t("title")} />
      <p className="text-base text-ink">{write ? t("introWrite") : t("intro")}</p>
      {data && !connectOn && <p className="mt-4 text-base text-ink-muted">{t("connectOff")}</p>}
      <div className="mt-4">{body}</div>

      {data && connectOn && (
        <>
          <div className="mt-5 grid gap-2 md:flex md:flex-wrap md:items-center md:gap-3">
            {atLimit ? (
              <p className="py-3 text-base text-ink">{t("atLimit", { count: MAX_LIVE_CONNECTIONS })}</p>
            ) : (
              <button
                ref={connectRef}
                type="button"
                onClick={(e) => createSheet.open(e.currentTarget)}
                className={btnPrimary}
              >
                {t("connect")}
              </button>
            )}
            <button
              ref={howToRef}
              id={howToButtonId}
              type="button"
              aria-expanded={howToOpen}
              aria-controls={howToId}
              onClick={() => setHowToOpen((v) => !v)}
              className={btnSecondary}
            >
              {t("howToConnect")}
              <Icon
                name="chevronDown"
                className={`size-5 transition-transform duration-150 ${howToOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          <div id={howToId} hidden={!howToOpen} className="mt-5 border-t border-rule pt-5">
            {howToOpen && (
              <>
                <ConnectionInstructions url={url} labelledBy={howToButtonId} />
                <p className="mt-5 text-base text-ink-muted">{t("lostKey")}</p>
              </>
            )}
          </div>
        </>
      )}

      {createSheet.shown && (
        <CreateConnectionSheet
          key={createSheet.shown.key}
          open={createSheet.isOpen}
          returnFocusTo={createSheet.shown.opener}
          onClose={createSheet.close}
          writeAvailable={data?.availability.write ?? false}
        />
      )}
      {revoke.dialog}
      <KeyRevealSheet reveal={reveal} url={url} onDone={handleRevealDone} />
    </Card>
  );
}
