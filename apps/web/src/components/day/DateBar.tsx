"use client";

import { Icon } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { addDays, dayLabel, formatDayShort, isIsoDate } from "@/lib/localDate";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactElement } from "react";

// ---------------------------------------------------------------------------
// DateBar: the day shown, with a 44 px chevron on each side. The label reads
// "Today", "Yesterday", "Tomorrow" or a short date, on one line in a fixed
// 44 px row.
//
// The label is a real button, "Choose a date, Today", one Tab stop. Its
// click, Enter and Space open the platform's date picker (`showPicker()`).
// The platform's own date input lies over it, invisible and out of the Tab
// order, so a tap on a phone lands on the input and opens the native picker
// (an owner rule: native controls on touch). Desktop Chromium and Firefox
// open no picker on a click on a date input's text, so a click on it calls
// `showPicker()` too.
//
// A date is applied only when it is whole and plausible. A choice from a
// picker applies at once. Digits typed into the input after a click apply on
// Enter or when the input loses focus, so typing 2026 never passes through
// the year 202.
//
// "Typing" is read from the input's own keys, never from the page's last
// input: the platform's picker is a popup whose keys never reach the page,
// so after Enter on the button the page still believes a key was last, and a
// picked date would wait for a blur that never comes. A digit, an arrow,
// Backspace or Delete on the input itself starts typing. Applying, a blur
// and every opening of the picker end it.
// ---------------------------------------------------------------------------

export interface DateBarProps {
  /** The date shown, or null while today is not known yet. */
  date: string | null;
  today: string | null;
  onChange: (date: string) => void;
}

/** Opens the platform's picker where the browser offers one by script. Some refuse a second call while open. */
function openPicker(input: HTMLInputElement | null): void {
  try {
    input?.showPicker?.();
  } catch {
    // Already open, or not allowed here: the platform's own behaviour stands.
  }
}

/** A whole date with a four-digit year from 1900 on: anything shorter is a year still being typed. */
export function plausibleDate(value: string): boolean {
  if (!isIsoDate(value)) return false;
  const year = Number(value.slice(0, 4));
  return year >= 1900 && year <= 2999;
}

/** The keys that edit a date input's text in place. */
const TYPING_KEYS = /^(?:\d|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Backspace|Delete)$/;

const chevron = `flex size-11 shrink-0 items-center justify-center rounded-pill text-ink hover:bg-surface active:bg-surface disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;

export function DateBar({ date, today, onChange }: DateBarProps): ReactElement {
  const t = useTranslations("day.dateBar");
  const inputRef = useRef<HTMLInputElement>(null);
  const word = date && today ? dayLabel(date, today) : null;
  const label =
    word === "today"
      ? t("today")
      : word === "yesterday"
        ? t("yesterday")
        : word === "tomorrow"
          ? t("tomorrow")
          : date
            ? formatDayShort(date, undefined, today ?? undefined)
            : "";

  // Uncontrolled, so digits being typed stay as typed until applied.
  // A new date from anywhere else is written in while the input is not in use.
  const applied = useRef(date);
  /** Keys pressed on the input itself since the picker last opened: its changes wait for Enter or blur. */
  const typing = useRef(false);
  useEffect(() => {
    applied.current = date;
    const input = inputRef.current;
    if (input && document.activeElement !== input) input.value = date ?? "";
  }, [date]);

  function apply(value: string): void {
    typing.current = false;
    if (plausibleDate(value) && value !== applied.current) {
      applied.current = value;
      onChange(value);
    }
  }

  return (
    <div data-date-bar="" className="flex h-11 items-center gap-2">
      <button
        type="button"
        aria-label={t("previous")}
        disabled={date === null}
        onClick={() => date && onChange(addDays(date, -1))}
        className={chevron}
      >
        <Icon name="chevronLeft" className="size-6" />
      </button>
      <div className="relative flex h-11 min-w-0 flex-1">
        <button
          type="button"
          data-date-label=""
          aria-label={t("choose", { label })}
          disabled={date === null}
          onClick={() => {
            typing.current = false;
            openPicker(inputRef.current);
          }}
          className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-control ${focusRing}`}
        >
          <span className="truncate font-display text-xl font-medium text-ink">{label}</span>
        </button>
        <input
          ref={inputRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          disabled={date === null}
          defaultValue={date ?? ""}
          onChange={(e) => {
            // Typed digits wait for Enter or blur. A picker's choice applies now.
            if (!typing.current) apply(e.target.value);
          }}
          onBlur={(e) => {
            apply(e.target.value);
            // A date left half typed goes back to the day shown.
            e.target.value = applied.current ?? "";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply(e.currentTarget.value);
            } else if (TYPING_KEYS.test(e.key)) {
              typing.current = true;
            }
          }}
          onClick={(e) => {
            typing.current = false;
            openPicker(e.currentTarget);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <button
        type="button"
        aria-label={t("next")}
        disabled={date === null}
        onClick={() => date && onChange(addDays(date, 1))}
        className={chevron}
      >
        <Icon name="chevronRight" className="size-6" />
      </button>
    </div>
  );
}
