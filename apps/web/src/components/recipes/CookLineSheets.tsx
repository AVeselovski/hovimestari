"use client";

import type { SheetTarget } from "@/hooks/useSheetTarget";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { IngredientPicker } from "./IngredientPicker";
import { NotCountedSheet } from "./NotCountedSheet";
import type { CountedDraft, DraftLine, PlainDraft } from "./recipeDraft";

// ---------------------------------------------------------------------------
// CookLineSheets: the two sheets a line of a batch opens in, stacked on the
// "log as made" sheet. A counted line opens the editor's ingredient picker on
// its amount, and Add ingredient opens it on the search. A line not counted
// opens its own sheet. Both are the recipe editor's, given a batch's words:
// the header names the batch, and a recipe's line has Leave out where the
// editor has Remove ingredient. Leave out deletes nothing, so it is drawn in
// ink, as a plain action. A line the batch added keeps Remove ingredient.
// ---------------------------------------------------------------------------

export interface CookLineSheetsProps {
  recipeName: string;
  /** The picker's open: a counted line, or null to add one. */
  picker: SheetTarget<CountedDraft | null>;
  /** The open of a line not counted. */
  plain: SheetTarget<PlainDraft>;
  /** Whether the line the picker is open on is one of the recipe's, which is left out, not removed. */
  fromRecipe: boolean;
  /** Where focus goes when a sheet closes after its line was removed: the row is gone. */
  afterRemove: HTMLElement | null;
  onAdd: (line: Omit<CountedDraft, "id">) => void;
  onSave: (line: DraftLine) => void;
  onRemove: (lineId: string, opener: HTMLElement | null) => void;
}

export function CookLineSheets(props: CookLineSheetsProps): ReactElement {
  const { recipeName, picker, plain, afterRemove, onAdd, onSave, onRemove } = props;
  const t = useTranslations("recipes.cook");
  return (
    <>
      {picker.shown && (
        <IngredientPicker
          key={`picker-${picker.shown.key}`}
          open={picker.isOpen}
          onClose={picker.close}
          returnFocusTo={afterRemove ?? picker.shown.opener}
          recipeName={recipeName}
          editing={picker.shown.value}
          onAdd={onAdd}
          onSave={onSave}
          onRemove={(lineId) => onRemove(lineId, picker.shown?.opener ?? null)}
          words={{
            adding: t("pickerAdding", { name: recipeName }),
            changing: t("pickerChanging", { name: recipeName }),
            takeOut: props.fromRecipe ? t("leaveOut") : undefined,
          }}
        />
      )}
      {plain.shown && (
        <NotCountedSheet
          key={`plain-${plain.shown.key}`}
          open={plain.isOpen}
          onClose={plain.close}
          returnFocusTo={afterRemove ?? plain.shown.opener}
          line={plain.shown.value}
          // A line not counted is only ever one of the recipe's here: the sheet adds none.
          onAdd={() => {}}
          onSave={onSave}
          onRemove={(lineId) => onRemove(lineId, plain.shown?.opener ?? null)}
          takeOutLabel={t("leaveOut")}
        />
      )}
    </>
  );
}
