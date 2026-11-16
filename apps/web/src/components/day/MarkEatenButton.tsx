"use client";

import { Icon } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { MouseEvent, ReactElement } from "react";

// ---------------------------------------------------------------------------
// The state mark at the start of an entry row, always in one 44 px box, so a
// mark changes no row's height or place:
// - planned on today or a past day: a button, the empty circle, "Mark {name}
//   eaten". While its mark is sent, a busy ring turns inside the same box.
// - eaten: a filled check, an indicator, not a button.
// - planned on a future day: a dashed circle, an indicator, since nothing
//   can be eaten on a day that has not come.
// ---------------------------------------------------------------------------

export type MarkKind = "button" | "eaten" | "future";

export interface MarkEatenButtonProps {
  kind: MarkKind;
  name: string;
  busy: boolean;
  /** Writes wait while the app asks the server for today. */
  held: boolean;
  /** `fromKeyboard` is true for a press made with Enter or Space. */
  onMark: (fromKeyboard: boolean) => void;
}

export function MarkEatenButton({ kind, name, busy, held, onMark }: MarkEatenButtonProps): ReactElement {
  const t = useTranslations("day.row");
  if (kind === "eaten") {
    return (
      <span
        role="img"
        aria-label={t("eaten")}
        data-mark="eaten"
        className="flex size-11 items-center justify-center text-ink"
      >
        <Icon name="checkCircle" className="size-7" />
      </span>
    );
  }
  if (kind === "future") {
    return (
      <span
        role="img"
        aria-label={t("planned")}
        data-mark="future"
        className="flex size-11 items-center justify-center text-ink-muted"
      >
        <Icon name="circleDashed" className="size-7" strokeWidth={1.75} />
      </span>
    );
  }
  const unavailable = busy || held;
  return (
    <button
      type="button"
      data-mark="button"
      data-row-action="mark"
      aria-label={t("mark", { name })}
      aria-disabled={unavailable || undefined}
      aria-busy={busy || undefined}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (!unavailable) onMark(e.detail === 0);
      }}
      className={`relative flex size-11 shrink-0 items-center justify-center rounded-pill text-ink hover:bg-surface-raised active:bg-surface-raised aria-disabled:cursor-not-allowed ${focusRing}`}
    >
      <Icon name="circle" className="size-7" strokeWidth={1.75} />
      {busy && (
        <span
          aria-hidden="true"
          className="absolute inset-2 animate-spin rounded-pill border-2 border-transparent border-t-ink motion-reduce:animate-none"
        />
      )}
    </button>
  );
}
