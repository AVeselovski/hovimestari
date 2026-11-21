"use client";

import { Field } from "@/components/form/Field";
import { DecimalField } from "@/components/ui/DecimalField";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import {
  btnText,
  btnWide,
  fieldErrorClass,
  fieldHintClass,
  lineRoom,
  pairRowAlways,
  sectionStart,
  sectionTitle,
} from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { createRecipe, updateRecipe } from "@/lib/api/recipes";
import { getErrorCode, getErrorLine } from "@/lib/errors";
import { OfflineError } from "@/lib/failure";
import { focusAfterRowRemoval } from "@/lib/focusAfterRemoval";
import { formatGrams } from "@/lib/foodFormat";
import { afterRecipeSaved } from "@/lib/invalidation";
import { newId } from "@/lib/newId";
import { recipesQuery } from "@/lib/queryOptions";
import type { ErrorCode, Recipe } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useState, type ReactElement } from "react";
import { IngredientPicker } from "./IngredientPicker";
import { IngredientRows } from "./IngredientRows";
import { NotCountedSheet } from "./NotCountedSheet";
import { ProseField } from "./ProseField";
import {
  DRAFT_FIELD_OF,
  DRAFT_ORDER,
  draftOf,
  liveFigures,
  readDraft,
  servingsOf,
  type CountedDraft,
  type DraftField,
  type DraftLine,
  type PlainDraft,
  type RecipeDraft,
} from "./recipeDraft";
import { RecipeFigures } from "./RecipeFigures";
import { TagField } from "./TagField";
import { tagsInUse } from "./tags";
import type { RecipeOutcome } from "./useRecipeActions";
import { useRecipeDelete } from "./useRecipeDelete";

// ---------------------------------------------------------------------------
// RecipeEditorSheet: a recipe made or changed, in a tall form sheet. New
// (empty), Edit (the recipe), and Duplicate (the recipe as a new one, its
// name the same and selected, so typing replaces it). Top to bottom: Name,
// Serves and Time, the ingredients with Add ingredient and Add a line not
// counted, the figures as they are typed, Method (one step per line), Notes
// and Tags, and on an edit Archive or Restore, turning in place.
//
// - The figures come from `recipeBasis` over the lines' foods, the function
//   the server runs on the same lines, so they are the figures Save stores.
// - Add ingredient stacks the ingredient picker on this sheet. A line pressed
//   opens it on its amount to change it. A line not counted has a sheet of
//   its own. Nothing is sent until Save recipe. A line removed gives focus
//   to the next line, else the one before, else Add ingredient.
// - Save sends the whole recipe, every field, since an edit clears a field
//   it leaves out. A new recipe's id is made when the sheet opens and kept
//   across retries. The sheet closes once the answer is in the cached lists
//   and the recipe's page, and never waits for the reads that follow. The
//   next open starts from that answer, so it sends the ids the server holds.
// - A refusal lands under its field, with focus on it. A refusal that names
//   a line shows under that ingredient. Anything else shows in the footer. A
//   portion removed since the line was written turns that line into grams
//   and says so, so the next save passes.
// - Writes wait while the app asks the server for today.
// ---------------------------------------------------------------------------

export type RecipeEditorSheetProps = FormSheetCallerProps & {
  /** The recipe to edit, or to copy with `copy`. Left out, a new recipe. */
  recipe?: Recipe;
  /** Opens `recipe` as a new recipe filled in from it. */
  copy?: boolean;
  /** The save worked: the recipe as the server answered it. The lists and its page already hold it. */
  onSavedRecipe?: (recipe: Recipe, created: boolean) => void;
  /** The recipe was deleted from this sheet, which has closed itself. */
  onDeleted?: (id: string) => void;
  /** Archive or restore from the edit form. */
  archive?: { busy: boolean; set: (archived: boolean) => Promise<RecipeOutcome> };
};

export function RecipeEditorSheet(props: RecipeEditorSheetProps): ReactElement {
  const { open, onClose, returnFocusTo, onSaved, recipe, copy = false, onSavedRecipe, onDeleted, archive } = props;
  const editing = recipe !== undefined && !copy ? recipe : null;
  const t = useTranslations("recipes.editor");
  const tPage = useTranslations("recipes.page");
  const tRow = useTranslations("day.row");
  const tCommon = useTranslations("common");
  const errorCopy = useErrorCopy();
  const failureLine = useFailureLine("form");
  const client = useQueryClient();
  const offline = useKnownOffline();
  const { holding } = useToday();
  const id = useId();
  const fieldId = (field: DraftField): string => `${id}-${field}`;

  const [initial] = useState<RecipeDraft>(() => draftOf(recipe, copy));
  const [draft, setDraft] = useState<RecipeDraft>(initial);
  const [errors, setErrors] = useState<Partial<Record<DraftField, ErrorCode>>>({});
  const [lineRefusal, setLineRefusal] = useState<{ index: number; line: string } | null>(null);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [saving, setSaving] = useState(false);
  const [archived, setArchived] = useState(editing?.archived ?? false);
  // Made once per open and kept across retries, so a repeated create applies once.
  const [recipeId] = useState(() => editing?.id ?? newId());
  const picker = useSheetTarget<CountedDraft | null>();
  const plain = useSheetTarget<PlainDraft | null>();
  // Where focus goes when a line's sheet closes after Remove: the row that opened it is gone.
  const [afterRemove, setAfterRemove] = useState<HTMLElement | null>(null);
  const waits = holding || (archive?.busy ?? false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  // A refused field takes focus once its line is on screen, which for the figures is only after the render.
  const [refused, setRefused] = useState<{ field: DraftField; n: number } | null>(null);
  useLayoutEffect(() => {
    if (refused) document.getElementById(`${id}-${refused.field}`)?.focus();
  }, [id, refused]);
  const focusOn = (field: DraftField): void => setRefused((prev) => ({ field, n: (prev?.n ?? 0) + 1 }));

  const allRecipes = useQuery(recipesQuery(false)).data?.recipes;
  const otherTags = tagsInUse((allRecipes ?? []).filter((r) => r.id !== recipeId));

  // No figures, not zeros, until the recipe has a line.
  const figures = draft.lines.length === 0 ? null : liveFigures(draft.lines, servingsOf(draft.servings));
  const remove = useRecipeDelete({
    onDone: (gone) => {
      onClose();
      onDeleted?.(gone.id);
    },
  });

  function change<K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]): void {
    setDraft((d) => ({ ...d, [key]: value }));
    // One serving's size follows the servings, so its refusal goes with either.
    setErrors((e) => ({ ...e, [key]: undefined, ...(key === "servings" ? { figures: undefined } : {}) }));
  }

  function setLines(edit: (lines: DraftLine[]) => DraftLine[]): void {
    setDraft((d) => ({ ...d, lines: edit(d.lines) }));
    setLineRefusal(null);
    setErrors((e) => ({ ...e, lines: undefined, figures: undefined }));
  }

  /** What a line's sheet does to the lines: a new one at the end, one changed in place, one removed. */
  const lineEdits = {
    onAdd: (line: Omit<CountedDraft, "id"> | Omit<PlainDraft, "id">) =>
      setLines((lines) => [...lines, { ...line, id: newId() } as DraftLine]),
    onSave: (line: DraftLine) => setLines((lines) => lines.map((l) => (l.id === line.id ? line : l))),
    onRemove: (lineId: string, opener: HTMLElement | null) => {
      // Read while the row is still there: the next line, else the one before, else Add ingredient.
      setAfterRemove(focusAfterRowRemoval(opener, document.getElementById(fieldId("lines"))));
      setLines((lines) => lines.filter((l) => l.id !== lineId));
    },
  };

  function openLine(index: number, opener: HTMLElement): void {
    setAfterRemove(null);
    const line = draft.lines[index];
    if (line.kind === "counted") picker.open(opener, line);
    else plain.open(opener, line);
  }

  function failed(err: unknown, sent: RecipeDraft): void {
    const code = getErrorCode(err);
    const line = getErrorLine(err);
    if (line !== undefined && line < sent.lines.length) {
      const at = sent.lines[line];
      if (code === "portion_not_found" && at.kind === "counted") {
        // The portion went away since the line was written: the line is in grams from here on, and says so.
        setDraft((d) => ({
          ...d,
          lines: d.lines.map((l, i) => (i === line && l.kind === "counted" ? { ...l, portion: null } : l)),
        }));
        const amount = tRow("grams", { grams: formatGrams(at.grams) });
        setLineRefusal({ index: line, line: t("portionGone", { amount }) });
      } else setLineRefusal({ index: line, line: errorCopy.forError(err) });
      setFormError(null);
      return;
    }
    const field = code ? DRAFT_FIELD_OF[code] : undefined;
    if (field && code) {
      setErrors({ [field]: code });
      focusOn(field);
      return;
    }
    setFormError({ line: failureLine(err), cause: err });
  }

  async function handleSubmit(): Promise<void> {
    if (saving || waits) return;
    setFormError(null);
    setLineRefusal(null);
    const read = readDraft(draft);
    if (!read.ok) {
      setErrors(read.errors);
      const first = DRAFT_ORDER.find((f) => read.errors[f] !== undefined);
      if (first) focusOn(first);
      // A refusal that belongs to no field here: the footer says the save could not go.
      else setFormError({ line: errorCopy.forCode("invalid_request"), cause: null });
      return;
    }
    setErrors({});
    if (offline) {
      setFormError({ line: failureLine(new OfflineError()), cause: new OfflineError() });
      return;
    }
    setSaving(true);
    const sent = draft;
    try {
      const saved = editing
        ? await updateRecipe(editing.id, read.body)
        : await createRecipe({ id: recipeId, ...read.body });
      // Resolves once the lists and the recipe's page hold the answer. The reads that follow are not waited for.
      await afterRecipeSaved(client, saved, editing === null);
      onSavedRecipe?.(saved, editing === null);
    } catch (err) {
      setSaving(false);
      failed(err, sent);
      return;
    }
    // Still busy: the sheet slides out showing what was on screen.
    onSaved?.();
    onClose();
  }

  async function toggleArchive(): Promise<void> {
    if (!archive || waits || saving) return;
    setFormError(null);
    const outcome = await archive.set(!archived);
    if (outcome.ok) setArchived((a) => !a);
    else if (outcome.failure !== null) setFormError({ line: outcome.failure, cause: null });
  }

  const lineOf = (field: DraftField, hint?: string): string | null =>
    errors[field] !== undefined ? errorCopy.forCode(errors[field]) : (hint ?? null);
  const figuresNote =
    errors.figures !== undefined ? (
      <p id={fieldId("figures")} tabIndex={-1} className={fieldErrorClass}>
        {errorCopy.forCode(errors.figures)}
      </p>
    ) : figures === null && draft.lines.length > 0 ? (
      <p className={fieldHintClass}>{t("figuresWait")}</p>
    ) : null;

  return (
    <FormSheet
      open={open}
      onClose={onClose}
      title={editing ? t("titleEdit") : t("titleNew")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={saving}
      held={waits}
      onSubmit={handleSubmit}
      formError={formError}
      idle={t("save")}
      busy={t("saving")}
      footerStart={
        editing ? { label: tCommon("delete"), onPress: (opener) => remove.open(editing, opener) } : undefined
      }
      sheet={{
        size: "tall",
        panelClassName: "md:max-w-xl",
        holdScroll: true,
        stacked: (
          <>
            {picker.shown && (
              <IngredientPicker
                key={`picker-${picker.shown.key}`}
                open={picker.isOpen}
                onClose={picker.close}
                returnFocusTo={afterRemove ?? picker.shown.opener}
                recipeName={draft.name}
                editing={picker.shown.value}
                onAdd={lineEdits.onAdd}
                onSave={lineEdits.onSave}
                onRemove={(lineId) => lineEdits.onRemove(lineId, picker.shown?.opener ?? null)}
              />
            )}
            {plain.shown && (
              <NotCountedSheet
                key={`plain-${plain.shown.key}`}
                open={plain.isOpen}
                onClose={plain.close}
                returnFocusTo={afterRemove ?? plain.shown.opener}
                line={plain.shown.value}
                onAdd={lineEdits.onAdd}
                onSave={lineEdits.onSave}
                onRemove={(lineId) => lineEdits.onRemove(lineId, plain.shown?.opener ?? null)}
              />
            )}
            {remove.dialog}
          </>
        ),
      }}
    >
      {({ autoFocus }) => (
        <>
          <Field
            id={fieldId("name")}
            name="name"
            label={t("name")}
            autoComplete="off"
            enterKeyHint="next"
            autoFocus={autoFocus}
            value={draft.name}
            onChange={(e) => change("name", e.target.value)}
            onFocus={(e) => {
              if (copy) e.currentTarget.select();
            }}
            error={lineOf("name")}
          />
          <div className={pairRowAlways}>
            <DecimalField
              id={fieldId("servings")}
              name="servings"
              label={t("servings")}
              unit={t("servingsUnit")}
              inputMode="numeric"
              value={draft.servings}
              onValueChange={(raw) => change("servings", raw)}
              invalid={errors.servings !== undefined}
              line={lineOf("servings")}
            />
            <DecimalField
              id={fieldId("time")}
              name="time"
              label={t("time")}
              unit={t("timeUnit")}
              inputMode="numeric"
              value={draft.time}
              onValueChange={(raw) => change("time", raw)}
              invalid={errors.time !== undefined}
              line={lineOf("time")}
            />
          </div>
          <section aria-labelledby={`${fieldId("lines")}-title`} data-editor-ingredients="">
            <h3 id={`${fieldId("lines")}-title`} className={`${sectionTitle} mb-1`}>
              {t("ingredients")}
            </h3>
            <IngredientRows lines={draft.lines.map(rowOf)} idPrefix={id} refused={lineRefusal} onOpen={openLine} />
            <p
              id={`${fieldId("lines")}-line`}
              className={`${errors.lines ? fieldErrorClass : fieldHintClass} ${lineRoom}`}
            >
              {errors.lines ? errorCopy.forCode(errors.lines) : draft.lines.length === 0 ? t("linesEmpty") : null}
            </p>
            <div className="mt-1 flex flex-col items-start gap-1">
              <button
                id={fieldId("lines")}
                type="button"
                aria-describedby={`${fieldId("lines")}-line`}
                onClick={(e) => {
                  setAfterRemove(null);
                  picker.open(e.currentTarget, null);
                }}
                className={btnWide}
              >
                {t("addIngredient")}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  setAfterRemove(null);
                  plain.open(e.currentTarget, null);
                }}
                className={btnText}
              >
                {t("addNotCounted")}
              </button>
            </div>
          </section>
          <div className={sectionStart}>
            <RecipeFigures
              headingId={`${id}-figures-title`}
              perServing={figures?.perServing ?? null}
              whole={figures?.whole ?? null}
              note={figuresNote}
              inSheet
            />
          </div>
          <div className={sectionStart}>
            <ProseField
              id={fieldId("method")}
              name="method"
              label={t("method")}
              rows={4}
              value={draft.method}
              onChange={(value) => change("method", value)}
              hint={t("methodHint")}
              error={errors.method !== undefined ? errorCopy.forCode(errors.method) : null}
            />
          </div>
          <ProseField
            id={fieldId("notes")}
            name="notes"
            label={t("notes")}
            rows={3}
            short
            value={draft.notes}
            onChange={(value) => change("notes", value)}
            error={errors.notes !== undefined ? errorCopy.forCode(errors.notes) : null}
          />
          <TagField
            id={fieldId("tags")}
            tags={draft.tags}
            onChange={(tags) => change("tags", tags)}
            others={otherTags}
            error={lineOf("tags")}
          />
          {archive && editing && (
            <div data-recipe-archive="" className={sectionStart}>
              {/* One button that turns in place, so focus stays on it from Archive to Restore and back. */}
              <button
                type="button"
                aria-disabled={waits || saving || undefined}
                aria-busy={archive.busy || undefined}
                onClick={() => void toggleArchive()}
                className={btnText}
              >
                {archived ? tPage("restore") : tPage("archive")}
              </button>
            </div>
          )}
        </>
      )}
    </FormSheet>
  );
}

/** A draft line as the rows show it. */
function rowOf(line: DraftLine) {
  return line.kind === "counted"
    ? {
        id: line.id,
        food: line.food,
        name: null,
        grams: line.grams,
        portion: line.portion,
        written: line.written,
        note: line.note,
      }
    : { id: line.id, food: null, name: line.name, grams: null, portion: null, written: line.written, note: line.note };
}
