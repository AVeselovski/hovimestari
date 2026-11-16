"use client";

import { EntrySheet } from "@/components/entries/EntrySheet";
import { FoodSearchLauncher } from "@/components/foods/FoodSearchLauncher";
import { PageContainer } from "@/components/ui/PageContainer";
import { btnSecondary } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useEntryActions } from "@/hooks/useEntryActions";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { focusAfterRowRemoval } from "@/lib/focusAfterRemoval";
import { addDays, isIsoDate } from "@/lib/localDate";
import { dayQuery } from "@/lib/queryOptions";
import type { Entry } from "@hovimestari/types";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { DateBar } from "./DateBar";
import { DaySummary } from "./DaySummary";
import { EntryList } from "./EntryList";

// ---------------------------------------------------------------------------
// DayTab: one day. The date bar, the food search, the summary and the
// entries, top to bottom, at fixed places whatever state the day is in.
//
// The date is `?date=` when it is a real date, else today from the server
// (`useToday`). Never keyed by date: the entry sheet is mounted here, above
// the date's content, so an open sheet with typed values survives a new
// date, a refresh and midnight. The day before and after are read ahead, so
// a chevron usually shows its day at once.
//
// The summary and the list sit in one frame whose heights do not depend on
// the state: loading, a failure and offline each show in the summary's frame.
//
// Layout: one column on a phone, the regions 12 px apart and
// the date bar 8 px over the food search, so the first entry
// shows on a phone's first screen. The shell shows no title on this tab: the
// date bar is the header. From `lg` the tab widens to two columns: the date
// bar over the summary and the food search over the entries, so the summary
// and the entries start at the same height. The end keeps a toast's room, so
// a toast never covers the last row's mark.
// ---------------------------------------------------------------------------

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
  const day = waitForToday || query.data?.targets == null ? null : (query.data ?? null);

  useEffect(() => {
    if (date === null) return;
    void client.prefetchQuery(dayQuery(addDays(date, -1)));
    void client.prefetchQuery(dayQuery(addDays(date, 1)));
  }, [client, date]);

  const actions = useEntryActions(date);
  const sheet = useSheetTarget<Entry>();
  const launcherRef = useRef<HTMLDivElement>(null);

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
    if (query.data && query.data.targets === null) notice = failedNotice(() => void query.refetch());
    else if (query.isError) notice = failedNotice(() => void query.refetch());
    else if (query.fetchStatus === "paused") notice = offlineNotice;
  }

  return (
    <PageContainer
      wide
      clearToast
      untitled
      className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10 lg:gap-y-6"
    >
      {/* The header pair, 8 px apart on a phone. From lg its two rows become the grid's first row. */}
      <div className="flex flex-col gap-2 lg:contents">
        <DateBar date={date} today={today} onChange={go} />
        <div ref={launcherRef}>
          <FoodSearchLauncher />
        </div>
      </div>
      <DaySummary date={date ?? ""} day={day} past={past} notice={notice} />
      <EntryList
        entries={day?.entries ?? null}
        future={future}
        actions={actions}
        onOpen={(entry, opener) => sheet.open(opener, entry)}
      />
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
