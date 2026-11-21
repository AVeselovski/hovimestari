"use client";

import { Icon } from "@/components/Icon";
import { errorTextClass, focusRing, ingredientGrid } from "@/components/ui/styles";
import type { FoodSource } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { useLineAmount, type LineAmountParts } from "./lineAmount";

// ---------------------------------------------------------------------------
// IngredientRows: a recipe's lines, in the order they were added. Each line
// shows its amount in the monospaced face ("4 × Medium piece · 240 g",
// "2 cloves · 10 g", "400 g") and the food's name, its note muted under it. On a
// phone the amount sits under the name, so a long name and a long amount
// each have the row's width. From md the amount is a column of its own
// before the name. A line not counted shows its own words for the amount,
// if any, and "Not counted". A line whose food is gone says so under it.
// No line shows figures: rounded one by one they would not add up to the
// recipe's (the figures card shows those).
//
// On the recipe page the rows only show. In the editor each row is a button
// at least 56 pixels tall that opens the line to change it, and a refusal
// of a save that names a line shows under that line.
// ---------------------------------------------------------------------------

/** A line as the rows show it. */
export interface IngredientRowLine extends LineAmountParts {
  id: string;
  /** The food of a counted line. */
  food: { name: string; source: FoodSource; retired: boolean; deleted: boolean } | null;
  /** The name of a line not counted. */
  name: string | null;
  note: string | null;
}

export interface IngredientRowsProps {
  lines: readonly IngredientRowLine[];
  /** Makes each row a button that opens its line. */
  onOpen?: (index: number, opener: HTMLElement) => void;
  /** A refusal that names a line, by its index, shown under that line. */
  refused?: { index: number; line: string } | null;
  /** An id prefix, so a refused line's message can be named. */
  idPrefix: string;
}

/** The attribute each row's element carries, with the line's id, so focus can find it again. */
export const INGREDIENT_ROW_ATTRIBUTE = "data-ingredient-row";

export function IngredientRows({ lines, onOpen, refused, idPrefix }: IngredientRowsProps): ReactElement {
  const t = useTranslations("recipes.page");
  const tEditor = useTranslations("recipes.editor");
  const amountOf = useLineAmount();
  return (
    <ul data-ingredient-rows="">
      {lines.map((line, index) => {
        const amount = amountOf(line);
        const gone =
          line.food === null
            ? null
            : line.food.deleted
              ? t("foodDeleted")
              : line.food.retired
                ? line.food.source === "fineli"
                  ? t("foodRetiredFineli")
                  : t("foodRetiredProduct")
                : null;
        const refusal = refused?.index === index ? refused.line : null;
        const refusalId = `${idPrefix}-line-${index}-refusal`;
        const body = (
          <span className={ingredientGrid}>
            <span className="min-w-0 md:order-2">
              <span className="block text-base break-words text-ink">{line.food?.name ?? line.name}</span>
              {line.note !== null && <span className="block text-sm break-words text-ink-muted">{line.note}</span>}
              {line.food === null && <span className="block text-sm text-ink-muted">{t("notCounted")}</span>}
              {gone !== null && <span className="block text-sm text-ink-muted">{gone}</span>}
            </span>
            {amount !== "" && (
              <span className="mt-0.5 block font-mono text-sm break-words text-ink tabular-nums md:order-1 md:mt-0 md:text-base">
                {amount}
              </span>
            )}
          </span>
        );
        return (
          <li key={line.id} className="border-b border-rule last:border-b-0">
            {onOpen ? (
              <button
                type="button"
                {...{ [INGREDIENT_ROW_ATTRIBUTE]: line.id }}
                aria-description={tEditor("lineOpens")}
                aria-describedby={refusal !== null ? refusalId : undefined}
                aria-invalid={refusal !== null || undefined}
                onClick={(e) => onOpen(index, e.currentTarget)}
                className={`flex min-h-14 w-full items-center gap-2 py-2.5 text-left hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
              >
                {body}
                <Icon name="chevronRight" className="size-5 shrink-0 text-ink-muted" />
              </button>
            ) : (
              <div {...{ [INGREDIENT_ROW_ATTRIBUTE]: line.id }} className="flex min-h-12 items-center py-2.5">
                {body}
              </div>
            )}
            {refusal !== null && (
              <p id={refusalId} className={`${errorTextClass} pb-2.5`}>
                {refusal}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
