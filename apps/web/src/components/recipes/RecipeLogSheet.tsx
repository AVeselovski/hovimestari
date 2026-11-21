"use client";

import { parseCount, type EntryFieldError } from "@/components/entries/amount";
import { CountField } from "@/components/entries/CountField";
import { StateChoice } from "@/components/entries/StateChoice";
import { focusField } from "@/components/form/focus";
import { AmountFigures } from "@/components/log/AmountFigures";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { NativeDateInput, dateHintId } from "@/components/ui/NativeDateInput";
import { labelClass } from "@/components/ui/styles";
import type { AddDone, AddRequest, EntryActions } from "@/hooks/entryActions";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useToday } from "@/hooks/useToday";
import { formatCount } from "@/lib/entryFormat";
import { getErrorCode } from "@/lib/errors";
import { isIsoDate } from "@/lib/localDate";
import { newId } from "@/lib/newId";
import { entryFigures, type EntryStatus, type RecipeSummary } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactElement } from "react";

// ---------------------------------------------------------------------------
// RecipeLogSheet: a recipe put on a day from its page. Eaten or planned,
// the date, today to start with, the servings, 1 to start with (the API
// answers no last servings yet, and the sheet opens on them once it does),
// and "For this amount" with the four figures. A future date takes a
// planned entry only, as every entry does. Log, or Add to plan while
// Planned is chosen. The figures are `entryFigures` on the recipe's basis,
// the values the server writes into the entry, so one serving shows what the
// page's "Per serving" shows. The entry's id is made when the sheet opens
// and kept across retries. After the add the sheet closes, and the add's
// toast, with Undo, shows once it has. It names the day, since the day is
// not on screen: "Added Shakshuka to the plan for Sat 21 Nov."
// ---------------------------------------------------------------------------

export type RecipeLogSheetProps = FormSheetCallerProps & {
  recipe: RecipeSummary;
  actions: Pick<EntryActions, "add" | "holding">;
};

export function RecipeLogSheet({
  open,
  onClose,
  returnFocusTo,
  onSaved,
  recipe,
  actions,
}: RecipeLogSheetProps): ReactElement {
  const t = useTranslations("recipes.logSheet");
  const tSheet = useTranslations("entries.sheet");
  const tBlock = useTranslations("log.block");
  const tRow = useTranslations("day.row");
  const failureLine = useFailureLine("form");
  const errorCopy = useErrorCopy();
  const { today } = useToday();
  const id = useId();
  const [date, setDate] = useState(() => today ?? "");
  const [chosen, setChosen] = useState<EntryStatus | null>(null);
  const [servings, setServings] = useState(() => formatCount(recipe.lastServings ?? 1, "en"));
  const [error, setError] = useState<EntryFieldError | undefined>(undefined);
  const [dateError, setDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [entryId, setEntryId] = useState(() => newId());
  const announce = useRef<(() => void) | null>(null);

  const future = today !== null && isIsoDate(date) && date > today;
  const status: EntryStatus = future ? "planned" : (chosen ?? "eaten");
  const count = parseCount(servings);
  const preview = typeof count === "number" ? entryFigures(recipe.basis, { per: "serving", count }) : null;
  const dirty = chosen !== null || date !== (today ?? "") || servings !== formatCount(recipe.lastServings ?? 1, "en");

  function requestFor(entry: string, n: number): AddRequest {
    return {
      body: { kind: "recipe", id: entry, date, status, recipeId: recipe.id, servings: n },
      name: recipe.name,
      amount: tRow("servings", { count: n }),
      again: () => requestFor(newId(), n),
      // Away from the day's own page, the toast says which day it went to.
      namesDay: true,
    };
  }

  async function handleSubmit(): Promise<void> {
    if (submitting || actions.holding) return;
    setFormError(null);
    if (!isIsoDate(date)) {
      setDateError(errorCopy.forCode("invalid_date"));
      focusField(`${id}-date`);
      return;
    }
    if (typeof count !== "number") {
      setError(count);
      focusField(`${id}-servings`);
      return;
    }
    setSubmitting(true);
    let done: AddDone | "held";
    try {
      done = await actions.add(requestFor(entryId, count));
    } catch (err) {
      setSubmitting(false);
      const code = getErrorCode(err);
      if (code === "entry_count_invalid") {
        setError(code);
        focusField(`${id}-servings`);
        return;
      }
      if (code === "entry_id_taken") setEntryId(newId());
      setFormError({ line: failureLine(err), cause: err });
      return;
    }
    if (done === "held") {
      setSubmitting(false);
      return;
    }
    announce.current = done.announce;
    onSaved?.();
    onClose();
  }

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={t("title", { name: recipe.name })}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={submitting}
      held={actions.holding}
      onSubmit={handleSubmit}
      formError={formError}
      idle={status === "planned" ? tBlock("plan") : tBlock("log")}
      busy={tBlock("logging")}
      sheet={{
        panelClassName: "md:max-w-md",
        titleClassName: "line-clamp-2 break-words",
        onClosed: () => {
          const shown = announce.current;
          announce.current = null;
          shown?.();
        },
      }}
    >
      {({ autoFocus }) => (
        <>
          <StateChoice
            id={`${id}-state`}
            value={status}
            onChange={setChosen}
            future={future}
            reason={{ id: dateHintId(`${id}-date`), shown: dateError === null }}
          />
          <div>
            <label htmlFor={`${id}-date`} className={labelClass}>
              {t("date")}
            </label>
            <NativeDateInput
              id={`${id}-date`}
              value={date}
              onValueChange={(next) => {
                setDate(next);
                setDateError(null);
              }}
              error={dateError}
              // Why Eaten is unavailable, under the date that makes it so.
              hint={future ? tSheet("futureHint") : null}
            />
          </div>
          <CountField
            id={`${id}-servings`}
            of="servings"
            value={servings}
            onChange={(raw) => {
              setServings(raw);
              setError(undefined);
            }}
            error={error}
            autoFocus={autoFocus}
          />
          <AmountFigures preview={preview} empty={servings.trim() === ""} />
        </>
      )}
    </FormSheet>
  );
}
