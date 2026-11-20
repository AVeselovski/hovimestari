"use client";

import { BottomSheet, SheetDescription } from "@/components/ui/BottomSheet";
import { PromptSheetBody } from "@/components/ui/PromptSheetBody";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnSecondary, errorTextClass, focusRing, listLine } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { restoreFocus } from "@/lib/lastInputModality";
import { formatMomentDay, formatMomentTime } from "@/lib/localDate";
import { connectionChangesQuery } from "@/lib/queryOptions";
import type { AssistantChange } from "@hovimestari/types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Fragment, memo, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { changeText, spokenText, type ChangeWords } from "./changeText";

/** The connection whose record the sheet shows: a live one, or a revoked one under Past connections. */
export interface ActivityTarget {
  id: string;
  name: string;
  /** How many changes its row said it made. A few or none: the sheet is as tall as its content. */
  changeCount: number;
}

interface ConnectionActivitySheetProps {
  /** False while it slides out. The caller mounts it once per open. */
  open: boolean;
  connection: ActivityTarget;
  /** Which open of the sheet this is. Each open reads the record afresh. */
  openKey: number;
  /** The row's Activity button, where focus goes back. */
  returnFocusTo?: HTMLElement | null;
  onClose: () => void;
}

/**
 * The most changes a record can count and still open as tall as its content.
 * A longer one opens tall from the first frame. Four rows already fill most of
 * a phone, so above this the two sizes differ by little, and a fixed height
 * then keeps the title and Close where they are whenever the list lands.
 */
const SHORT_RECORD = 3;

/** What the live region says, once: a new id makes it say the same words again. */
interface Announcement {
  id: number;
  text: string;
}

/** The next announcement: these words, under a new id, so the region says them even when they repeat. */
function announcing(text: string): (prev: Announcement | null) => Announcement {
  return (prev) => ({ id: (prev?.id ?? 0) + 1, text });
}

/**
 * "Changes by {name}": everything one connection changed, newest first, 50 at
 * a time. A `BottomSheet` with no input, so every dismissal closes it, and
 * its body takes focus as it opens, at every width, so a key press right
 * after opening does not land on Close.
 *
 * A connection whose row counted more than a few changes opens tall from the
 * first frame, so its title and Close stay where they are when the list
 * arrives. One that counted a few or none opens as tall as its content, up
 * to the tall size.
 *
 * It reports and offers nothing to do with a change: no undo, no link, no
 * colour that reads as good or bad. Each change is a headline, its lines and
 * the time it was made (`changeText.ts`). A screen reader hears each change
 * as one sentence of the same words.
 *
 * The first page is read as the sheet opens, and nothing reads it again while
 * it is open. Show more appends the next page below the rows on screen, so
 * nothing above moves. Focus then moves to the first new row, scrolled only
 * as far as it takes to show it, and a polite live region says how many more
 * are shown. A failed page keeps every page shown, turns Show more into Try
 * again, and the live region says it failed.
 */
export function ConnectionActivitySheet({
  open,
  connection,
  openKey,
  returnFocusTo,
  onClose,
}: ConnectionActivitySheetProps): ReactElement {
  const t = useTranslations("settings.connectedAi.activitySheet");
  const tSection = useTranslations("settings.connectedAi");
  const units = useTranslations("foods.portionUnits");
  const { user } = useAuth();
  const query = useInfiniteQuery(connectionChangesQuery(connection.id, openKey));
  const listRef = useRef<HTMLUListElement>(null);
  // The index of the first row the page Show more asked for will add.
  const focusRowRef = useRef<number | null>(null);
  // Try again was pressed on a first page that failed. A read with no data
  // starts again as pending, so the failed line and the button are held
  // where they are until the answer.
  const [retrying, setRetrying] = useState(false);
  // Once a first page that failed has loaded, Try again is gone: the first
  // row takes focus, or the body, as on open, when the record is empty.
  const focusFirstRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  // The pages in order. A page after a cursor starts below the change the
  // cursor names, so no row repeats (the route's paging rule).
  const changes = useMemo(
    (): AssistantChange[] => (query.data?.pages ?? []).flatMap((page) => page.changes),
    [query.data],
  );

  const words = useMemo((): ChangeWords => ({ t, units }), [t, units]);
  const loadingMore = query.isFetchingNextPage;
  const moreFailed = query.isFetchNextPageError && !loadingMore;

  function retry(): void {
    if (retrying) return;
    setRetrying(true);
    focusFirstRef.current = true;
    void query.refetch().finally(() => setRetrying(false));
  }

  function showMore(): void {
    if (loadingMore || !query.hasNextPage) return;
    focusRowRef.current = changes.length;
    void query.fetchNextPage();
  }

  useLayoutEffect(() => {
    const index = focusRowRef.current;
    if (index === null || loadingMore) return;
    focusRowRef.current = null;
    if (query.isFetchNextPageError) {
      // Show more, now Try again, keeps focus, and the region says why nothing came.
      setAnnouncement(announcing(t("moreFailed")));
      return;
    }
    const row = listRef.current?.children[index];
    if (!(row instanceof HTMLElement)) return;
    restoreFocus(row);
    // The row lands where Show more was, so its headline is usually in view
    // already, and then nothing scrolls and no row above moves. Otherwise,
    // such as when Show more was pressed out of view, it scrolls only as far
    // as it takes to show the row.
    const view = row.closest("[data-sheet-body]")?.getBoundingClientRect();
    const headline = (row.querySelector("p") ?? row).getBoundingClientRect();
    if (!view || headline.top < view.top || headline.bottom > view.bottom) row.scrollIntoView({ block: "nearest" });
    setAnnouncement(announcing(t("moreShown", { count: changes.length - index })));
  }, [changes, loadingMore, query.isFetchNextPageError, t]);

  useLayoutEffect(() => {
    if (!focusFirstRef.current || !query.data) return;
    focusFirstRef.current = false;
    const first = listRef.current?.firstElementChild;
    restoreFocus(
      first instanceof HTMLElement ? first : contentRef.current?.closest<HTMLElement>("[data-prompt-sheet-body]"),
    );
  }, [query.data]);

  let body: ReactElement;
  if (query.data) {
    body =
      changes.length === 0 ? (
        <p className={listLine}>{t("empty")}</p>
      ) : (
        <>
          <ul ref={listRef} className="border-y border-rule">
            {changes.map((change) => (
              <ChangeRow key={change.id} change={change} words={words} timeZone={user?.timeZone} />
            ))}
          </ul>
          {query.hasNextPage && (
            <div className="mt-4">
              <button
                type="button"
                onClick={showMore}
                aria-disabled={loadingMore || undefined}
                className={`w-full ${btnSecondary}`}
              >
                <StableLabel
                  active={loadingMore}
                  idle={moreFailed ? tSection("retry") : t("more")}
                  busy={t("moreLoading")}
                />
              </button>
              {/* The live region at the end of the body says it once as it happens. */}
              <p className={`mt-2 min-h-5 ${errorTextClass}`}>{moreFailed ? t("moreFailed") : null}</p>
            </div>
          )}
        </>
      );
  } else if (query.isError || retrying) {
    body = (
      <div className="flex flex-col items-stretch gap-3 md:items-start">
        <p role="alert" className={`py-3 ${errorTextClass} text-base`}>
          {t("failed")}
        </p>
        <button type="button" aria-disabled={retrying || undefined} onClick={retry} className={btnSecondary}>
          {tSection("retry")}
        </button>
      </div>
    );
  } else {
    body = (
      <p role="status" className={listLine}>
        {t("loading")}
      </p>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t("title", { name: connection.name })}
      titleClassName="wrap-anywhere"
      size={connection.changeCount > SHORT_RECORD ? "tall" : "auto"}
      panelClassName="md:max-w-xl"
      returnFocusTo={returnFocusTo}
      footer={
        <div className="grid md:flex md:justify-end">
          <button type="button" onClick={onClose} className={btnSecondary}>
            {t("close")}
          </button>
        </div>
      }
    >
      <PromptSheetBody>
        <SheetDescription className="mb-4 text-base text-ink-muted">{t("intro")}</SheetDescription>
        <div ref={contentRef} aria-busy={!query.data && !query.isError ? true : undefined}>
          {body}
        </div>
        <div role="status" className="sr-only">
          {announcement && <span key={announcement.id}>{announcement.text}</span>}
        </div>
      </PromptSheetBody>
    </BottomSheet>
  );
}

/**
 * One change: what was changed in the body face, its lines in the
 * monospaced face the app gives figures and lists, and when. A screen reader
 * hears the same words as one sentence, with the dots spoken as pauses.
 * Focusable by code only, for the focus Show more hands on.
 */
const ChangeRow = memo(function ChangeRow({
  change,
  words,
  timeZone,
}: {
  change: AssistantChange;
  words: ChangeWords;
  timeZone: string | undefined;
}): ReactElement {
  const { t } = words;
  const text = changeText(change, words);
  const when = t("at", { date: formatMomentDay(change.at, timeZone), time: formatMomentTime(change.at, timeZone) });
  return (
    // The rule is on each row's top, never on its bottom, so a page appended
    // below leaves every row above exactly as it was.
    // The focus ring stands outside the row, in the body's side padding, and
    // the scroll margin keeps it in view when Show more scrolls to the row.
    <li
      tabIndex={-1}
      data-change-id={change.id}
      className={`scroll-my-2 border-t border-rule py-4 first:border-t-0 ${focusRing}`}
    >
      <span className="sr-only">{spokenText(text, when, t)}</span>
      <div aria-hidden="true">
        <p className="text-base font-semibold wrap-anywhere text-ink">{text.headline}</p>
        {text.lines.map((line, i) => (
          <p key={i} className="mt-1 font-mono text-sm wrap-anywhere text-ink tabular-nums">
            {line.label !== null && (
              <>
                <span className="text-ink-muted">{t("lineLabel", { label: line.label })}</span>{" "}
              </>
            )}
            {line.parts.map((part, j) => (
              <Fragment key={j}>
                {j > 0 && " "}
                {/* A part keeps together with the dot before it while it fits on a line, so a
                    figure never parts from its unit and no dot is left alone. A longer one wraps inside itself. */}
                <span className="inline-block max-w-full">
                  {j > 0 && <span className="text-ink-muted">{"· "}</span>}
                  {part}
                </span>
              </Fragment>
            ))}
          </p>
        ))}
        <p className="mt-1.5 text-sm text-ink-muted">
          <time dateTime={change.at}>{when}</time>
        </p>
      </div>
    </li>
  );
});
