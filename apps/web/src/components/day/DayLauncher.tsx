"use client";

import { Icon } from "@/components/Icon";
import { FoodSheet } from "@/components/foods/FoodSheet";
import { focusRing } from "@/components/ui/styles";
import type { EntryActions } from "@/hooks/entryActions";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// DayLauncher: the way into the log sheet, under the date bar. A full-width
// button drawn like a search field, "Log food" on today and past days and
// "Add to plan" on a future day. It opens the sheet on the day shown, and the
// sheet keeps logging to that date while it is open. It keeps the sheet
// mounted while it slides out, with a fresh one on every open, so a second
// tap of a double tap opens it once.
//
// It waits while the app asks the server for today (`holding`), or while no
// date is known: `aria-disabled`, and a press opens nothing.
// ---------------------------------------------------------------------------

export interface DayLauncherProps {
  /** The day shown, or null while today is not known. */
  date: string | null;
  /** The day shown is after today. */
  future: boolean;
  actions: Pick<EntryActions, "add" | "saveAndLog" | "withdrawAdd" | "logCook" | "holding">;
}

export function DayLauncher({ date, future, actions }: DayLauncherProps): ReactElement {
  const t = useTranslations("day.launcher");
  const sheet = useSheetTarget<{ date: string }>();
  const waits = actions.holding || date === null;
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        data-day-launcher=""
        aria-disabled={waits || undefined}
        onClick={(e) => {
          if (!waits && date !== null) sheet.open(e.currentTarget, { date });
        }}
        className={`flex h-12 w-full items-center gap-3 rounded-control border border-field-rule bg-surface-raised px-3.5 text-left text-base text-ink-muted hover:text-ink active:bg-surface aria-disabled:cursor-not-allowed ${focusRing}`}
      >
        <Icon name="search" className="size-5 shrink-0" />
        {future ? t("plan") : t("log")}
      </button>
      {sheet.shown && (
        <FoodSheet
          key={sheet.shown.key}
          open={sheet.isOpen}
          onClose={sheet.close}
          returnFocusTo={sheet.shown.opener}
          date={sheet.shown.value.date}
          actions={actions}
        />
      )}
    </>
  );
}
