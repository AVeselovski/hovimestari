"use client";

import { usePortionChipLabel } from "@/components/entries/portionLabel";
import { MacroDot } from "@/components/figures/MacroDot";
import { focusRing } from "@/components/ui/styles";
import { formatCount } from "@/lib/entryFormat";
import { formatGrams, formatKcal } from "@/lib/foodFormat";
import type { Entry } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type ReactElement } from "react";
import { MarkEatenButton, type MarkKind } from "./MarkEatenButton";

// ---------------------------------------------------------------------------
// EntryRow: one entry, in the order it was added. An `<li>` holding two
// siblings: the 44 px state mark and the row's main button, which opens the
// entry sheet, so no button sits inside another. The main button shows the
// name, one meta line (the amount, or "Estimate", with a meal's source) and
// the entry's kcal over its protein. Nothing in a row but the mark depends
// on its state, so marking it changes no height.
// ---------------------------------------------------------------------------

export interface EntryRowProps {
  entry: Entry;
  /** The day is after today: its planned entries cannot be marked. */
  future: boolean;
  busy: boolean;
  held: boolean;
  /** Changes when an Undo from the keyboard asks for this row's focus. */
  focusKey?: number;
  /** The row took the focus `focusKey` asked for, so the request is not used again. */
  onFocusTaken?: (focusKey: number) => void;
  /** Marks the entry eaten. Answers whether it was marked. */
  onMark: (entry: Entry) => Promise<boolean>;
  onOpen: (entry: Entry, opener: HTMLElement) => void;
}

function useMeta(): (entry: Entry) => string {
  const t = useTranslations("day.row");
  const portionLabel = usePortionChipLabel();
  return (entry) => {
    if (entry.kind === "estimate") return t("estimate");
    if (entry.kind === "saved_meal") {
      const amount = t("meals", { count: entry.count ?? 0 });
      const source = entry.savedMeal?.source;
      return source ? t("withSource", { amount, source }) : amount;
    }
    const grams = formatGrams(entry.grams ?? 0);
    return entry.portion
      ? t("portion", { count: formatCount(entry.portion.count), portion: portionLabel(entry.portion), grams })
      : t("grams", { grams });
  };
}

export function EntryRow({
  entry,
  future,
  busy,
  held,
  focusKey,
  onFocusTaken,
  onMark,
  onOpen,
}: EntryRowProps): ReactElement {
  const t = useTranslations("day.row");
  const meta = useMeta();
  const mainRef = useRef<HTMLButtonElement>(null);
  // A mark sent from the keyboard: once it lands and the circle becomes the
  // check, focus moves to the row's main button instead of falling to <body>.
  const focusOnEaten = useRef(false);
  useEffect(() => {
    if (entry.status === "eaten" && focusOnEaten.current) {
      focusOnEaten.current = false;
      mainRef.current?.focus();
    }
  }, [entry.status]);
  // An Undo pressed from the keyboard: focus lands here once the row shows it,
  // once. The request is then spent, so this row mounting again later (the
  // day shown again) leaves focus where it is.
  const taken = useRef(onFocusTaken);
  taken.current = onFocusTaken;
  useEffect(() => {
    if (focusKey === undefined) return;
    mainRef.current?.focus();
    taken.current?.(focusKey);
  }, [focusKey]);

  const kind: MarkKind = entry.status === "eaten" ? "eaten" : future ? "future" : "button";
  const approx = entry.isEstimate ? (
    <>
      <span aria-hidden="true">{t("approx")}</span>
      <span className="sr-only">{t("estimated")} </span>
    </>
  ) : null;
  return (
    <li data-entry-id={entry.id} className="flex items-center gap-1 border-b border-rule">
      <MarkEatenButton
        kind={kind}
        name={entry.name}
        busy={busy}
        held={held}
        onMark={(fromKeyboard) => {
          focusOnEaten.current = fromKeyboard;
          void onMark(entry).then((marked) => {
            // Not marked (failed, offline or held): a later eaten state must not take focus.
            if (!marked) focusOnEaten.current = false;
          });
        }}
      />
      <button
        ref={mainRef}
        type="button"
        data-row-action="open"
        aria-haspopup="dialog"
        onClick={(e) => onOpen(entry, e.currentTarget)}
        className={`flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-sm py-2.5 pr-1 text-left hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
      >
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-base break-words text-ink">{entry.name}</span>
          <span className="block truncate text-sm text-ink-muted">{meta(entry)}</span>
        </span>
        <span className="shrink-0 space-y-0.5 text-right font-mono text-sm text-ink tabular-nums">
          <span className="flex items-center justify-end gap-1.5">
            <MacroDot macro="energy" />
            <span>
              {approx}
              {t("kcal", { value: formatKcal(entry.figures.energyKcal) })}
            </span>
          </span>
          <span className="flex items-center justify-end gap-1.5">
            <MacroDot macro="protein" />
            <span>
              {approx}
              <span aria-hidden="true">{t("protein", { value: formatGrams(entry.figures.proteinG) })}</span>
              <span className="sr-only">{t("proteinSpoken", { value: formatGrams(entry.figures.proteinG) })}</span>
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
