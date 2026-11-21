"use client";

import { CopyEntriesSheet } from "@/components/entries/CopyEntriesSheet";
import { EntrySheet } from "@/components/entries/EntrySheet";
import { useFirstRun } from "@/components/targets/TargetsGate";
import { PageContainer } from "@/components/ui/PageContainer";
import { btnSecondary } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useEntryActions } from "@/hooks/useEntryActions";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { focusAfterRowRemoval } from "@/lib/focusAfterRemoval";
import { restoreFocus } from "@/lib/lastInputModality";
import { addDays, isIsoDate } from "@/lib/localDate";
import { dayQuery, dayRangeQuery, prefetchLogLists, targetsQuery } from "@/lib/queryOptions";
import { forgetDayPlace, readDayPlace, scrollPageTo } from "@/lib/recipeNav";
import { rememberShownDay } from "@/lib/shownDay";
import { weekOf } from "@/lib/week";
import type { Entry } from "@hovimestari/types";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { DateBar } from "./DateBar";
import { DayHeader } from "./DayHeader";
import { DayLauncher } from "./DayLauncher";
import { DaySummary } from "./DaySummary";
import { EntryList } from "./EntryList";
import { loadedNoTargets, predictedNoTargets } from "./noTargets";
import { WeekSheet } from "./WeekSheet";

// ---------------------------------------------------------------------------
// DayTab: one day. The date bar, the log sheet's launcher, the summary and
// the entries, top to bottom, at fixed places whatever state the day is in.
//
// The date is `?date=` when it is a real date, else today from the server
// (`useToday`). Never keyed by date: the entry sheet is mounted here, above
// the date's content, so an open sheet with typed values survives a new
// date, a refresh and midnight. The day before and after are read ahead, so
// a chevron usually shows its day at once.
//
// The summary and the list sit in one frame whose heights do not depend on
// the state: loading, a failure and offline each show in the summary's frame.
// A day without targets (every day of a user with no targets, or a day
// before the first change) is a day like any other, with a shorter summary.
// Its frame comes from the changes the gate holds (`noTargets.ts`), so the
// summary opens at the height it keeps. For a user with no targets, the
// summary's Set targets opens the first-run page (`useFirstRun`). Back from
// it, the tab mounts again on the same address and puts focus on the date
// button, so focus never lands on the page's body.
//
// Layout: the date bar and the launcher are `DayHeader`, which stays at the
// top while the day scrolls under it: 16 px between them on a phone and
// 24 px of clearance under the launcher. The summary and the list follow
// 12 px apart. The shell shows no title on this tab: the date bar is the
// header. From `lg` the tab widens to two columns: the date bar over the
// summary and the launcher over the entries, so the summary and the entries
// start at the same height. From `lg` on a tall enough viewport the summary
// stays under the header too (`SUMMARY_COLUMN_CLASS`), so the day's figures
// stay beside a long list. The end keeps a toast's room, so a toast never
// covers the last row's mark.
//
// The day shown by `?date=` is remembered (`lib/shownDay.ts`), so the tab
// bar's Day link leads back to it from another tab.
//
// Week, after the launcher on its row, opens the week sheet on the week
// holding the day shown. A row there shows its day and puts focus back on
// Week. The row is 48 px with or without it, so the header keeps its height.
// The shown day's week is read ahead once the day is on screen.
//
// Copy, in the Entries row, opens the copy sheet on the day shown. Focus
// comes back to Copy when it closes.
//
// Back from a recipe that an entry's Open recipe opened, the day shows where
// it was scrolled, with focus on that entry's row (lib/recipeNav.ts).
// ---------------------------------------------------------------------------

/**
 * The summary's column. From `lg`, on a viewport tall enough for the header
 * and the tallest summary (the `summary-stays` variant in globals.css), it
 * stays where it starts at rest (`--day-content-top`, 24 px under the
 * launcher) while the entries scroll, so it never moves when it starts to
 * stay. Below that it scrolls.
 */
export const SUMMARY_COLUMN_CLASS = "lg:self-start summary-stays:sticky summary-stays:top-(--day-content-top)";

/** The content under the header: 24 px under the launcher at rest, and a focused row stops there too. */
export const DAY_CONTENT_CLASS =
  "under-day-header flex flex-col gap-3 pt-(--day-header-rest) lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10";

export function DayTab(): ReactElement {
  const t = useTranslations("day.states");
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const online = useOnlineStatus();
  const { status: authStatus } = useAuth();
  const offline = !online || authStatus === "offline";
  const { today, unconfirmed, confirm, retry } = useToday();

  const param = params.get("date");
  const explicit = param !== null && isIsoDate(param) ? param : null;
  const date = explicit ?? today;
  // Today's cached day may be yesterday's while the device's date is ahead
  // and the server has not answered: show the state of that ask instead.
  const waitForToday = explicit === null && unconfirmed;

  // No read before today is known, nor while its ask failed: skipToken sends nothing.
  const query = useQuery(
    date !== null && !waitForToday ? dayQuery(date) : { ...dayQuery(date ?? "none"), queryFn: skipToken },
  );
  const day = waitForToday ? null : (query.data ?? null);

  // The gate's targets answer, read from the cache: which changes the user
  // has, for a day without targets. This observer never fetches by itself.
  const { data: targets } = useQuery({ ...targetsQuery(), enabled: false });
  const noTargets = day ? loadedNoTargets(day, targets) : predictedNoTargets(date, targets);
  // A day without targets that the cached changes say has some: the changes
  // are out of date. Read them once for that date. The row keeps its room,
  // empty, until they answer, and stays empty if they still disagree.
  const pending = noTargets?.kind === "pending" ? day?.date : undefined;
  const refetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (pending === undefined || refetchedFor.current === pending) return;
    refetchedFor.current = pending;
    client.fetchQuery({ ...targetsQuery(), staleTime: 0 }).catch(() => {});
  }, [client, pending]);

  // The day shown by its address is the one the tab bar's Day link leads
  // back to. Today by the plain address is remembered as today (null), so
  // it keeps following the app across midnight.
  useEffect(() => {
    rememberShownDay(explicit);
  }, [explicit]);

  useEffect(() => {
    if (date === null) return;
    void client.prefetchQuery(dayQuery(addDays(date, -1)));
    void client.prefetchQuery(dayQuery(addDays(date, 1)));
  }, [client, date]);

  // Every list the log sheet's browsing shows, read once the day is on
  // screen, so the sheet opens with them and the day never waits on them.
  const dayLoaded = day !== null;
  useEffect(() => {
    if (!dayLoaded) return;
    prefetchLogLists(client);
  }, [client, dayLoaded]);

  // Back from a recipe an entry's Open recipe opened: the day where it was, with focus on that entry.
  const [place] = useState(() => (typeof window === "undefined" ? null : readDayPlace()));
  const returned = useRef(false);
  useLayoutEffect(() => {
    if (place === null || returned.current || !dayLoaded) return;
    returned.current = true;
    // The place has served its way back.
    forgetDayPlace();
    scrollPageTo(place.top);
    restoreFocus(
      document.querySelector<HTMLElement>(`[data-entry-id="${CSS.escape(place.entryId)}"] [data-row-action="open"]`),
    );
  }, [place, dayLoaded]);

  // The shown day's week, read once the day is on screen, so the week sheet usually opens with figures.
  useEffect(() => {
    if (!dayLoaded || date === null) return;
    const week = weekOf(date);
    void client.prefetchQuery(dayRangeQuery(week.from, week.to));
  }, [client, dayLoaded, date]);

  // Arrived from the first-run page, by leaving it or passing it: focus on
  // the date button, with no ring after a tap, once it can take it (it is disabled while today is not known).
  const firstRun = useFirstRun();
  const dateLabelRef = useRef<HTMLButtonElement>(null);
  const focusDateOnReturn = useRef(false);
  useEffect(() => {
    if (firstRun.takeReturned()) focusDateOnReturn.current = true;
  }, [firstRun]);
  useEffect(() => {
    if (!focusDateOnReturn.current || date === null) return;
    focusDateOnReturn.current = false;
    restoreFocus(dateLabelRef.current);
  }, [date]);

  const actions = useEntryActions(date);
  const sheet = useSheetTarget<Entry>();
  const week = useSheetTarget<{ date: string }>();
  const copy = useSheetTarget<{ date: string }>();
  const launcherRef = useRef<HTMLDivElement>(null);
  const tw = useTranslations("day.launcher");
  // Week waits as the launcher does: while today is not known, or while the app asks for it.
  const weekWaits = actions.holding || date === null;

  const past = date !== null && today !== null && date < today;
  const future = date !== null && today !== null && date > today;

  function go(next: string): void {
    router.replace(next === today ? "/" : `/?date=${next}`, { scroll: false });
  }

  const retryButton = (onPress: () => void) => (
    <button type="button" onClick={onPress} className={btnSecondary}>
      {t("retry")}
    </button>
  );
  const failedNotice = (onPress: () => void) => (
    <>
      <p role="status" className="text-base text-ink">
        {t("failed")}
      </p>
      {retryButton(onPress)}
    </>
  );
  const offlineNotice = (
    <p role="status" className="text-base text-ink">
      {t("offline")}
    </p>
  );

  let notice: ReactNode = null;
  if (date === null) {
    // No today: the targets read failed or waits for a connection.
    if (offline || confirm === "paused") notice = offlineNotice;
    else if (confirm !== "checking") notice = failedNotice(retry);
  } else if (waitForToday) {
    if (confirm === "paused") notice = offlineNotice;
    else if (confirm === "failed") notice = failedNotice(retry);
  } else if (day === null) {
    if (query.isError) notice = failedNotice(() => void query.refetch());
    else if (query.fetchStatus === "paused") notice = offlineNotice;
  }

  return (
    <PageContainer wide clearToast untitled>
      <DayHeader>
        <DateBar date={date} today={today} onChange={go} labelRef={dateLabelRef} />
        <div data-launcher-row="" className="flex gap-3">
          {/* The launcher alone: an entry removal falls back to its first button. */}
          <div ref={launcherRef} className="min-w-0 flex-1">
            <DayLauncher date={date} future={future} actions={actions} />
          </div>
          <button
            type="button"
            data-week-button=""
            aria-haspopup="dialog"
            aria-disabled={weekWaits || undefined}
            onClick={(e) => {
              if (!weekWaits && date !== null) week.open(e.currentTarget, { date });
            }}
            className={`${btnSecondary} shrink-0`}
          >
            {tw("week")}
          </button>
        </div>
      </DayHeader>
      <div data-day-content="" className={DAY_CONTENT_CLASS}>
        <div data-day-summary-column="" className={SUMMARY_COLUMN_CLASS}>
          <DaySummary
            date={date ?? ""}
            day={day}
            past={past}
            notice={notice}
            noTargets={noTargets}
            onSetTargets={() => void firstRun.open()}
          />
        </div>
        <EntryList
          entries={day?.entries ?? null}
          future={future}
          actions={actions}
          onOpen={(entry, opener) => sheet.open(opener, entry)}
          onCopy={(opener) => {
            if (date !== null) copy.open(opener, { date });
          }}
        />
      </div>
      {week.shown && (
        <WeekSheet
          key={week.shown.key}
          open={week.isOpen}
          onClose={week.close}
          returnFocusTo={week.shown.opener}
          shownDate={week.shown.value.date}
          onPick={(picked) => {
            week.close();
            go(picked);
          }}
        />
      )}
      {copy.shown && (
        <CopyEntriesSheet
          key={copy.shown.key}
          open={copy.isOpen}
          onClose={copy.close}
          returnFocusTo={copy.shown.opener}
          fromDate={copy.shown.value.date}
          actions={actions}
        />
      )}
      {sheet.shown && (
        <EntrySheet
          key={sheet.shown.key}
          open={sheet.isOpen}
          onClose={sheet.close}
          returnFocusTo={sheet.shown.opener}
          entry={sheet.shown.value}
          actions={actions}
          focusAfterRemove={() =>
            focusAfterRowRemoval(sheet.shown?.opener, launcherRef.current?.querySelector("button") ?? null)
          }
        />
      )}
    </PageContainer>
  );
}
