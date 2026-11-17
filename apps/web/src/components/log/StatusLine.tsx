"use client";

import { errorTextClass } from "@/components/ui/styles";
import { useToday } from "@/hooks/useToday";
import { dayLabel, formatDayShort } from "@/lib/localDate";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";

// ---------------------------------------------------------------------------
// StatusLine: the first line of the log sheet's header, in every view. It
// names the day the sheet logs to, from the sheet's date against today as
// the app knows it now, so a sheet left open past midnight turns from
// "Logging to today" into "Logging to yesterday" while it keeps logging to
// the date it opened with. For a moment the same line says what a press in
// the sheet did instead: a failure in the accent, as every error line is,
// such as a "+" that could not log, or a note in ink, such as "Saved
// Wolt bowl." after a meal saved without logging. One line, its room always
// kept, so the search field and Back under it never move.
// ---------------------------------------------------------------------------

/** How long a message stays on the status line, unless a press or a key ends it sooner. */
export const STATUS_MESSAGE_MS = 6000;

export interface StatusMessage {
  text: string;
  tone: "failure" | "note";
}

export function useStatusText(date: string): string {
  const t = useTranslations("log.status");
  const { today } = useToday();
  const word = today === null ? null : dayLabel(date, today);
  if (word === "today") return t("today");
  if (word === "yesterday") return t("yesterday");
  if (word === "tomorrow") return t("tomorrow");
  const shown = formatDayShort(date, undefined, today ?? undefined);
  return today !== null && date > today ? t("planDate", { date: shown }) : t("logDate", { date: shown });
}

/** A message for the status line, cleared after its time, or at the next press or keystroke anywhere. */
export function useStatusMessage(): {
  message: StatusMessage | null;
  say: (text: string, tone: StatusMessage["tone"]) => void;
  clear: () => void;
} {
  const [message, setMessage] = useState<StatusMessage | null>(null);
  useEffect(() => {
    if (message === null) return;
    const clear = (): void => setMessage(null);
    const timer = setTimeout(clear, STATUS_MESSAGE_MS);
    document.addEventListener("pointerdown", clear, true);
    document.addEventListener("keydown", clear, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", clear, true);
      document.removeEventListener("keydown", clear, true);
    };
  }, [message]);
  const say = useCallback((text: string, tone: StatusMessage["tone"]) => setMessage({ text, tone }), []);
  const clear = useCallback(() => setMessage(null), []);
  return useMemo(() => ({ message, say, clear }), [message, say, clear]);
}

export function StatusLine({ date, message }: { date: string; message: StatusMessage | null }): ReactElement {
  const text = useStatusText(date);
  const tone = message === null ? "text-ink-muted" : message.tone === "failure" ? errorTextClass : "text-ink";
  return (
    <p aria-live="polite" data-status-line="" className={`h-5 truncate text-sm leading-5 ${tone}`}>
      {message?.text ?? text}
    </p>
  );
}
