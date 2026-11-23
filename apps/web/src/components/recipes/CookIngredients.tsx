"use client";

import { btnWide, fieldErrorClass, lineRoom, sectionStart, sectionTitle } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import type { ErrorCode, Recipe } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { lineMarks, type CookDraftLine } from "./cookDraft";
import { IngredientRows, type IngredientRowLine } from "./IngredientRows";
import { useLineAmount } from "./lineAmount";

// ---------------------------------------------------------------------------
// CookIngredients: the lines of a batch in the "log as made" sheet, drawn
// with the editor's rows (`IngredientRows`). Each line opens to be changed.
// Under its amount a line says what the batch did with it:
//
// - "Changed. Recipe: 60 g" for a line that differs from the recipe line it
//   started as, with the recipe's amount, and its food's name when the food
//   changed too.
// - "Added" for a line the recipe does not have.
// - A line left out stays in its place, struck through, with Put back. One
//   that was changed before it was left out says "Left out. Recipe: 60 g", so
//   its row keeps the line it had and no row under it moves.
//
// What counts as changed and added comes from `lineMarks`, which runs the
// shared `cookDiff`, the function the server answers with, so the screen and
// the server agree. Add ingredient is under the lines, with the line a
// submit refuses them in.
// ---------------------------------------------------------------------------

export interface CookIngredientsProps {
  /** The sheet's id prefix: Add ingredient is `${id}-lines`, which takes focus when the lines are refused. */
  id: string;
  recipe: Recipe;
  lines: readonly CookDraftLine[];
  /** A refusal that names a line, by the line's id, shown under it. */
  refusal: { id: string; line: string } | null;
  /** What a submit refused about the lines as a whole, or null. */
  error: ErrorCode | null;
  onOpen: (index: number, opener: HTMLElement) => void;
  onPutBack: (index: number) => void;
  onAdd: (opener: HTMLElement) => void;
}

export function CookIngredients({
  id,
  recipe,
  lines,
  refusal,
  error,
  onOpen,
  onPutBack,
  onAdd,
}: CookIngredientsProps): ReactElement {
  const t = useTranslations("recipes.cook");
  const tEditor = useTranslations("recipes.editor");
  const errorCopy = useErrorCopy();
  const amountOf = useLineAmount();
  const marks = lineMarks(recipe, lines);
  const rows = lines.map((line): IngredientRowLine => {
    const mark = marks.get(line.id);
    const from = mark && mark.kind !== "added" ? mark.from : null;
    const fromName = from ? (from.food?.name ?? from.name ?? "") : "";
    const sameName = from !== null && fromName === (line.kind === "counted" ? line.food.name : line.name);
    const fromAmount = from ? amountOf(from) : "";
    const recipeHad =
      sameName && fromAmount !== ""
        ? fromAmount
        : fromAmount === ""
          ? fromName
          : t("nameAndAmount", { name: fromName, amount: fromAmount });
    return {
      id: line.id,
      food: line.kind === "counted" ? line.food : null,
      name: line.kind === "plain" ? line.name : null,
      grams: line.kind === "counted" ? line.grams : null,
      portion: line.kind === "counted" ? line.portion : null,
      written: line.written,
      note: line.note,
      leftOut: line.leftOut,
      mark:
        mark === undefined
          ? null
          : mark.kind === "added"
            ? t("markAdded")
            : mark.kind === "changed"
              ? t("markChanged", { recipe: recipeHad })
              : t("markLeftOut", { recipe: recipeHad }),
    };
  });
  const refusedIndex = refusal ? lines.findIndex((l) => l.id === refusal.id) : -1;
  return (
    <section aria-labelledby={`${id}-lines-title`} data-cook-ingredients="" className={sectionStart}>
      <h3 id={`${id}-lines-title`} className={`${sectionTitle} mb-1`}>
        {tEditor("ingredients")}
      </h3>
      <IngredientRows
        lines={rows}
        idPrefix={id}
        refused={refusal && refusedIndex !== -1 ? { index: refusedIndex, line: refusal.line } : null}
        onOpen={onOpen}
        onPutBack={onPutBack}
      />
      <p id={`${id}-lines-line`} className={`${fieldErrorClass} ${lineRoom}`}>
        {error ? errorCopy.forCode(error) : null}
      </p>
      <button
        id={`${id}-lines`}
        type="button"
        aria-describedby={`${id}-lines-line`}
        onClick={(e) => onAdd(e.currentTarget)}
        className={`${btnWide} mt-1`}
      >
        {tEditor("addIngredient")}
      </button>
    </section>
  );
}
