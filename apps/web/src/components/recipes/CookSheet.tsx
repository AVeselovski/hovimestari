"use client";

import { DecimalField } from "@/components/ui/DecimalField";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { NativeDateInput } from "@/components/ui/NativeDateInput";
import { fieldErrorClass, fieldHintClass, labelClass, sectionStart } from "@/components/ui/styles";
import type { EntryActions } from "@/hooks/entryActions";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { getErrorCode, getErrorLine } from "@/lib/errors";
import { focusAfterRowRemoval } from "@/lib/focusAfterRemoval";
import { formatGrams, formatKcal, formatMacroGrams } from "@/lib/foodFormat";
import { isIsoDate } from "@/lib/localDate";
import { newId } from "@/lib/newId";
import type { Entry, EntryStatus, ErrorCode, Recipe } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import {
  batchFigures,
  canAddRow,
  cookLinesOf,
  MOST_SERVINGS,
  newRow,
  nextRowDate,
  readCook,
  rowHasServings,
  sameBatch,
  type AddRow,
  type CookDraftLine,
  type CookErrors,
} from "./cookDraft";
import { CookIngredients } from "./CookIngredients";
import { CookLineSheets } from "./CookLineSheets";
import { CookServings } from "./CookServings";
import { INGREDIENT_ROW_ATTRIBUTE } from "./IngredientRows";
import { servingsOf, type CountedDraft, type DraftLine, type PlainDraft } from "./recipeDraft";
import { RecipeFigures } from "./RecipeFigures";
import { useOtherServings } from "./useOtherServings";

// ---------------------------------------------------------------------------
// CookSheet: a recipe logged as it was made, in a tall form sheet. One batch,
// with its own ingredients and the servings it gave, and the days its
// servings are on. Stacked on the sheet it opens from (an entry's sheet, the
// log sheet's recipe view) or on its own on the recipe's page. Top to bottom:
//
// - Made on, the day of the entry it opened from, else the day it was given.
// - It gave, the recipe's servings to start with.
// - Ingredients (`CookIngredients`): the recipe's lines. A line pressed opens
//   the ingredient picker on its amount, with Leave out. A line left out
//   stays in its place, struck through, with Put back. Add ingredient under
//   them. The recipe itself is never changed here.
// - Figures: one serving and the whole batch, from `recipeBasis` over the
//   lines the batch keeps, the function the server runs on the same lines,
//   with the recipe's own serving under them.
// - From this batch (`CookServings`): the days its servings are on.
//
// Log as made sends one request: the batch, the entries it attaches (the one
// it opened from, each ticked serving), a state for the opening entry when
// it changes, and the new servings. The batch's id is made when the sheet
// opens and kept across resends, so a press after a lost answer writes
// nothing twice. Such a press is answered with the batch as it was first
// stored: when that is not the batch on screen, the sheet stays and says so
// in the footer, and never says the changed one was logged. Cancel then
// closes the sheet it is stacked on with it, since that one still shows the
// entry as it was before the batch. A refusal lands
// under its field, with focus on it, one that names a line under that line,
// anything else in the footer. The toast, "Logged Shakshuka as made.", has
// no Undo, since each serving has its own through its entry.
//
// Log as made waits while the app asks the server for today, while the
// batch has no serving, ticked or added, while it has more than a batch
// takes, and while a tick is set and the days it was read from are read
// again after Made on changed.
//
// The sheet holds one height, so its top edge and its footer stay where they
// are while lines are left out, put back and added.
// ---------------------------------------------------------------------------

export type CookSheetProps = FormSheetCallerProps & {
  /** The recipe as the server holds it, read before the sheet opens. */
  recipe: Recipe;
  /** The entry the sheet opened from: a plain entry of this recipe. */
  entry?: Entry;
  /** The day the batch was made, to start with, when there is no entry: the day on screen, or today. */
  day: string;
  /** What the first row of new servings starts with, when there is no entry. */
  start?: { servings: string; status: EntryStatus };
  actions: Pick<EntryActions, "logCook" | "holding">;
  /**
   * The batch was logged. Given by a sheet this one is stacked on, which
   * closes itself and this one in one update and then calls `announce`.
   * Left out, this sheet closes itself and shows the toast once it has.
   */
  onLogged?: (announce: () => void) => void;
};

type Field = "date" | "servings" | "lines" | "figures" | "entries";

/** Which field a refusal the server answered belongs under. A code not listed goes to the footer. */
const FIELD_OF: Partial<Record<ErrorCode, Field>> = {
  invalid_date: "date",
  recipe_servings_invalid: "servings",
  recipe_lines_required: "lines",
  recipe_lines_too_many: "lines",
  recipe_serving_too_large: "figures",
  cook_entries_required: "entries",
};

interface State {
  date: string;
  servings: string;
  lines: CookDraftLine[];
  chosen: EntryStatus | null;
  ticked: string[];
  rows: AddRow[];
  /** With no entry, the first row stands above Add servings until it is removed. */
  firstStands: boolean;
}

/** The refusals that mean another account holds an id the app made. */
const ID_TAKEN: readonly (ErrorCode | undefined)[] = ["cook_id_taken", "ingredient_id_taken", "entry_id_taken"];

export function CookSheet(props: CookSheetProps): ReactElement {
  const { open, onClose, returnFocusTo, onSaved, recipe, entry, day, start, actions, onLogged } = props;
  const t = useTranslations("recipes.cook");
  const tEditor = useTranslations("recipes.editor");
  const tRow = useTranslations("day.row");
  const errorCopy = useErrorCopy();
  const failureLine = useFailureLine("form");
  const { today } = useToday();
  const id = useId();

  const [initial] = useState<State>(() => ({
    date: entry?.date ?? day,
    servings: String(recipe.servings),
    lines: cookLinesOf(recipe),
    chosen: null,
    ticked: [],
    rows: entry ? [] : [newRow(day, start?.servings ?? "1", start?.status === "planned" ? "planned" : null)],
    firstStands: !entry,
  }));
  const [state, setState] = useState<State>(initial);
  const [errors, setErrors] = useState<CookErrors>({});
  const [lineRefusal, setLineRefusal] = useState<{ id: string; line: string } | null>(null);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [saving, setSaving] = useState(false);
  // The batch is stored, as an earlier press sent it. Closing then closes the sheet under this one too.
  const [storedEarlier, setStoredEarlier] = useState(false);
  // Made once per open and kept across resends, so a repeated request applies once.
  const [cookId, setCookId] = useState(newId);
  const picker = useSheetTarget<CountedDraft | null>();
  const plain = useSheetTarget<PlainDraft>();
  // Where focus goes when a line's sheet closes after an added line was removed: its row is gone.
  const [afterRemove, setAfterRemove] = useState<HTMLElement | null>(null);
  const announce = useRef<(() => void) | null>(null);
  const dirty = JSON.stringify(state) !== JSON.stringify(initial);

  // A line left out or put back swaps its row's one control: focus follows it once the row has turned.
  // A refused field takes focus once its line is on screen.
  const [focusOn, setFocusOn] = useState<{ row?: string; field?: string; n: number } | null>(null);
  useLayoutEffect(() => {
    if (!focusOn) return;
    const target =
      focusOn.row !== undefined
        ? [...document.querySelectorAll<HTMLElement>(`[${INGREDIENT_ROW_ATTRIBUTE}]`)].find(
            (el) => el.getAttribute(INGREDIENT_ROW_ATTRIBUTE) === focusOn.row,
          )
        : document.getElementById(`${id}-${focusOn.field}`);
    target?.focus();
  }, [focusOn, id]);
  const focusRow = (row: string): void => setFocusOn((prev) => ({ row, n: (prev?.n ?? 0) + 1 }));
  /** Focus on a field of the sheet, by the end of its id: a refused field, or the control a removed row leaves. */
  const focus = (field: Field | string): void => setFocusOn((prev) => ({ field, n: (prev?.n ?? 0) + 1 }));

  const read = useOtherServings(recipe.id, state.date, entry?.id ?? null, cookId);
  // A row this batch added shows as a row, also once a press whose answer never came has stored it.
  const others = read.entries.filter((e) => !state.rows.some((r) => r.id === e.id));
  const ticked = others.filter((e) => state.ticked.includes(e.id));
  const attached = (entry ? 1 : 0) + ticked.length;
  const hasServings = attached > 0 || state.rows.some(rowHasServings);
  const count = attached + state.rows.length;
  // A tick must not be lost to a list that is being read again: the press waits for it.
  const ticksUnread = !read.settled && state.ticked.length > 0;
  const waits = actions.holding || !hasServings || count > MOST_SERVINGS || ticksUnread;

  const servings = servingsOf(state.servings);
  const figures = batchFigures(state.lines, servings);

  function change(patch: Partial<State>, cleared: Partial<CookErrors> = {}): void {
    setState((s) => ({ ...s, ...patch }));
    setErrors((e) => ({ ...e, ...cleared }));
  }

  function setLines(edit: (lines: CookDraftLine[]) => CookDraftLine[]): void {
    setState((s) => ({ ...s, lines: edit(s.lines) }));
    setLineRefusal(null);
    setErrors((e) => ({ ...e, lines: undefined, figures: undefined }));
  }

  /** What a line's sheet does to the lines: a new one at the end, one changed in place, one left out or removed. */
  const lineEdits = {
    onAdd: (line: Omit<CountedDraft, "id">) =>
      setLines((lines) => [...lines, { ...line, id: newId(), fromLineId: null, leftOut: false }]),
    onSave: (line: DraftLine) =>
      setLines((lines) =>
        lines.map((l) => (l.id === line.id ? { ...line, fromLineId: l.fromLineId, leftOut: l.leftOut } : l)),
      ),
    /** A recipe's line is left out and stays in its place. A line the batch added goes. */
    onRemove: (lineId: string, opener: HTMLElement | null) => {
      const line = state.lines.find((l) => l.id === lineId);
      if (line && line.fromLineId !== null) {
        setLines((lines) => lines.map((l) => (l.id === lineId ? { ...l, leftOut: true } : l)));
        focusRow(lineId);
        return;
      }
      // Read while the row is still there: the next line, else the one before, else Add ingredient.
      setAfterRemove(focusAfterRowRemoval(opener, document.getElementById(`${id}-lines`)));
      setLines((lines) => lines.filter((l) => l.id !== lineId));
    },
  };

  function openLine(index: number, opener: HTMLElement): void {
    setAfterRemove(null);
    const line = state.lines[index];
    if (line.kind === "counted") picker.open(opener, line);
    else plain.open(opener, line);
  }

  function putBack(index: number): void {
    const lineId = state.lines[index].id;
    setLines((lines) => lines.map((l) => (l.id === lineId ? { ...l, leftOut: false } : l)));
    focusRow(lineId);
  }

  function failed(err: unknown, sent: readonly CookDraftLine[]): void {
    const code = getErrorCode(err);
    if (ID_TAKEN.includes(code)) {
      // Another account holds an id the app made: the ids of that kind are made anew for the next press.
      if (code === "cook_id_taken") setCookId(newId());
      else if (code === "entry_id_taken") change({ rows: state.rows.map((r) => ({ ...r, id: newId() })) });
      else setLines((lines) => lines.map((l) => ({ ...l, id: newId() })));
      setFormError({ line: t("tryAgain"), cause: err });
      return;
    }
    const line = getErrorLine(err);
    if (line !== undefined && line < sent.length) {
      const at = sent[line];
      if (code === "portion_not_found" && at.kind === "counted") {
        // The portion went away since the recipe was read: the line is in grams from here on, and says so.
        setState((s) => ({
          ...s,
          lines: s.lines.map((l) => (l.id === at.id && l.kind === "counted" ? { ...l, portion: null } : l)),
        }));
        const amount = tRow("grams", { grams: formatGrams(at.grams) });
        setLineRefusal({ id: at.id, line: tEditor("portionGone", { amount }) });
      } else setLineRefusal({ id: at.id, line: errorCopy.forError(err) });
      setFormError(null);
      focusRow(at.id);
      return;
    }
    const field = code ? FIELD_OF[code] : undefined;
    if (field && code) {
      setErrors({ [field]: code });
      focus(field);
      return;
    }
    setFormError({ line: failureLine(err), cause: err });
  }

  async function handleSubmit(): Promise<void> {
    if (saving || waits) return;
    setFormError(null);
    setLineRefusal(null);
    const read = readCook({
      id: cookId,
      recipe,
      date: state.date,
      servings: state.servings,
      lines: state.lines,
      opening: entry ? { entry, chosen: state.chosen } : null,
      ticked,
      rows: state.rows,
      today,
    });
    if (!read.ok) {
      setErrors(read.errors);
      const refusedRow = state.rows.find((r) => read.errors.rows?.[r.id]);
      if (read.errors.date) focus("date");
      else if (read.errors.servings) focus("servings");
      else if (read.errors.lines) focus("lines");
      else if (refusedRow) {
        focus(`row-${refusedRow.id}-${read.errors.rows?.[refusedRow.id].date ? "date" : "servings"}`);
      } else if (read.errors.entries) focus("entries");
      else if (read.errors.form) setFormError({ line: errorCopy.forCode(read.errors.form), cause: null });
      return;
    }
    setErrors({});
    setSaving(true);
    let done;
    try {
      done = await actions.logCook({ body: read.body, name: recipe.name, dates: read.dates });
    } catch (err) {
      setSaving(false);
      failed(err, read.lines);
      return;
    }
    if (done === "held") {
      // Nothing was sent: the sheet stays as it is, for Log as made again.
      setSaving(false);
      return;
    }
    if (done.result.outcome === "replayed" && !sameBatch(read.body, done.result.cook, read.opening)) {
      // An earlier press stored the batch and its answer never came. What is on screen now was not stored.
      setSaving(false);
      setStoredEarlier(true);
      setFormError({ line: t("loggedAsFirstSent"), cause: null });
      return;
    }
    // Still busy: the sheet slides out showing what was on screen.
    onSaved?.();
    if (onLogged) onLogged(done.announce);
    else {
      announce.current = done.announce;
      onClose();
    }
  }

  // A new row starts on the first day from Made on with no serving of the recipe on the sheet.
  const taken = new Set([
    ...(entry ? [entry.date] : []),
    ...others.map((e) => e.date),
    ...state.rows.map((r) => r.date),
  ]);
  const rowDate = nextRowDate(isIsoDate(state.date) ? state.date : (today ?? day), taken);
  const atMost = count >= MOST_SERVINGS;
  const needs = state.rows.length > 0 ? t("needsServings") : others.length > 0 ? t("needsTickOrRow") : t("needsRow");
  const lineOf = (field: "servings", hint: string): string =>
    errors[field] !== undefined ? errorCopy.forCode(errors[field]) : hint;

  return (
    <FormSheet
      open={open}
      // The sheet under this one shows the entry as it was before the batch: it closes with this one, with no toast.
      onClose={storedEarlier && onLogged ? () => onLogged(() => {}) : onClose}
      title={t("title", { name: recipe.name })}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={saving}
      held={waits}
      onSubmit={handleSubmit}
      formError={formError}
      idle={t("log")}
      busy={t("logging")}
      sheet={{
        size: "tall",
        panelClassName: "md:max-w-xl",
        titleClassName: "line-clamp-2 break-words",
        holdScroll: true,
        onClosed: () => {
          const shown = announce.current;
          announce.current = null;
          shown?.();
        },
        stacked: (
          <CookLineSheets
            recipeName={recipe.name}
            picker={picker}
            plain={plain}
            fromRecipe={state.lines.find((l) => l.id === picker.shown?.value?.id)?.fromLineId != null}
            afterRemove={afterRemove}
            {...lineEdits}
          />
        ),
      }}
    >
      {({ autoFocus }) => (
        <>
          <div>
            <label htmlFor={`${id}-date`} className={labelClass}>
              {t("madeOn")}
            </label>
            <NativeDateInput
              id={`${id}-date`}
              autoFocus={autoFocus}
              value={state.date}
              onValueChange={(date) => change({ date }, { date: undefined })}
              error={errors.date ? errorCopy.forCode(errors.date) : null}
            />
          </div>
          <DecimalField
            id={`${id}-servings`}
            name="servings"
            label={t("gave")}
            unit={tEditor("servingsUnit")}
            inputMode="numeric"
            value={state.servings}
            onValueChange={(raw) => change({ servings: raw }, { servings: undefined, figures: undefined })}
            invalid={errors.servings !== undefined}
            line={lineOf("servings", t("recipeMakes", { count: recipe.servings }))}
          />
          <CookIngredients
            id={id}
            recipe={recipe}
            lines={state.lines}
            refusal={lineRefusal}
            error={errors.lines ?? null}
            onOpen={openLine}
            onPutBack={putBack}
            onAdd={(opener) => {
              setAfterRemove(null);
              picker.open(opener, null);
            }}
          />
          <div className={sectionStart}>
            <RecipeFigures
              headingId={`${id}-figures-title`}
              perServing={figures?.perServing ?? null}
              whole={figures?.whole ?? null}
              wholeLabel={t("wholeBatch")}
              inSheet
              note={
                errors.figures !== undefined ? (
                  <p id={`${id}-figures`} tabIndex={-1} className={fieldErrorClass}>
                    {errorCopy.forCode(errors.figures)}
                  </p>
                ) : (
                  <p data-recipe-serving="" className={fieldHintClass}>
                    {t("recipeFigures", {
                      kcal: formatKcal(recipe.perServing.energyKcal),
                      protein: formatMacroGrams(recipe.perServing.proteinG),
                    })}
                  </p>
                )
              }
            />
          </div>
          <div className={sectionStart}>
            <CookServings
              idPrefix={id}
              recipeName={recipe.name}
              today={today}
              opening={entry ? { entry, chosen: state.chosen } : null}
              onOpeningStatus={(chosen) => change({ chosen })}
              rows={state.rows}
              rowErrors={errors.rows ?? {}}
              onRow={(rowId, patch) => {
                setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)) }));
                setErrors((e) => ({ ...e, rows: { ...e.rows, [rowId]: {} }, entries: undefined }));
              }}
              onRemoveRow={(rowId) => {
                const first = state.firstStands && state.rows[0]?.id === rowId;
                change({ rows: state.rows.filter((r) => r.id !== rowId), firstStands: state.firstStands && !first });
                focus("add-servings");
              }}
              onAddRow={() => change({ rows: [...state.rows, newRow(rowDate)] }, { entries: undefined })}
              firstStands={state.firstStands}
              canAdd={canAddRow(attached, state.rows.length)}
              others={others}
              ticked={new Set(state.ticked)}
              canTick={!atMost}
              onTick={(entryId, on) => {
                // One more than a batch takes is not ticked. The section's line says why.
                if (on && atMost) return;
                change(
                  { ticked: on ? [...state.ticked, entryId] : state.ticked.filter((x) => x !== entryId) },
                  { entries: undefined },
                );
              }}
              error={errors.entries ?? null}
              hint={!hasServings ? needs : atMost ? t("mostServings", { count: MOST_SERVINGS }) : null}
            />
          </div>
        </>
      )}
    </FormSheet>
  );
}
