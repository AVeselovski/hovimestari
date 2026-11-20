"use client";

import { Field } from "@/components/form/Field";
import { focusField } from "@/components/form/focus";
import { DecimalField } from "@/components/ui/DecimalField";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import {
  btnText,
  btnWide,
  fieldErrorClass,
  fieldHintClass,
  labelClass,
  lineRoom,
  sectionStart,
  sectionTitle,
  textareaClass,
} from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { createRecipe, updateRecipe } from "@/lib/api/recipes";
import { getErrorCode, getErrorLine } from "@/lib/errors";
import { OfflineError } from "@/lib/failure";
import { afterRecipeSaved } from "@/lib/invalidation";
import { newId } from "@/lib/newId";
import { recipesQuery } from "@/lib/queryOptions";
import type { ErrorCode, Recipe } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState, type ReactElement } from "react";
import { IngredientPicker } from "./IngredientPicker";
import { IngredientRows } from "./IngredientRows";
import { NotCountedSheet } from "./NotCountedSheet";
import {
  DRAFT_FIELD_OF,
  DRAFT_ORDER,
  draftOf,
  liveFigures,
  readDraft,
  servingsOf,
  withAnsweredIds,
  type CountedDraft,
  type DraftField,
  type DraftLine,
  type PlainDraft,
  type RecipeDraft,
} from "./recipeDraft";
import { RecipeFigures } from "./RecipeFigures";
import { TagField } from "./TagField";
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
//   its own. Nothing is sent until Save recipe.
// - Save sends the whole recipe, every field, since an edit clears a field
//   it leaves out. A new recipe's id is made when the sheet opens and kept
//   across retries. After a save the lines take the ids the answer gives.
// - A refusal lands under its field, a refusal that names a line under that
//   ingredient, anything else in the footer. A portion removed since the
//   line was written turns that line into grams, so the next save passes.
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
  archive?: { busy: boolean; set: (archived: boolean) => Promise<string | null> };
};

export function RecipeEditorSheet(props: RecipeEditorSheetProps): ReactElement {
  const { open, onClose, returnFocusTo, onSaved, recipe, copy = false, onSavedRecipe, onDeleted, archive } = props;
  const editing = recipe !== undefined && !copy ? recipe : null;
  const t = useTranslations("recipes.editor");
  const tPage = useTranslations("recipes.page");
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
  const waits = holding || (archive?.busy ?? false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const allRecipes = useQuery(recipesQuery(false)).data?.recipes;
  const otherTags = [...new Set((allRecipes ?? []).filter((r) => r.id !== recipeId).flatMap((r) => r.tags))].sort(
    (a, b) => a.localeCompare(b, "fi"),
  );

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
    const field = key as DraftField;
    if (errors[field] !== undefined) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function setLines(edit: (lines: DraftLine[]) => DraftLine[]): void {
    setDraft((d) => ({ ...d, lines: edit(d.lines) }));
    setLineRefusal(null);
    setErrors((e) => ({ ...e, lines: undefined, figures: undefined }));
  }

  function failed(err: unknown, sent: RecipeDraft): void {
    const code = getErrorCode(err);
    const line = getErrorLine(err);
    if (line !== undefined && line < sent.lines.length) {
      if (code === "portion_not_found") {
        // The portion went away since the line was written: the line is in grams from here on.
        setDraft((d) => ({
          ...d,
          lines: d.lines.map((l, i) => (i === line && l.kind === "counted" ? { ...l, portion: null } : l)),
        }));
      }
      setLineRefusal({ index: line, line: errorCopy.forError(err) });
      setFormError(null);
      return;
    }
    const field = code ? DRAFT_FIELD_OF[code] : undefined;
    if (field && code) {
      setErrors({ [field]: code });
      focusField(fieldId(field));
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
      if (first) focusField(fieldId(first));
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
      // The next save sends the ids the server holds, so an edited line stays the same line.
      setDraft((d) => ({ ...d, lines: withAnsweredIds(d.lines, saved.lines) }));
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
    const failure = await archive.set(!archived);
    if (failure === null) setArchived((a) => !a);
    else setFormError({ line: failure, cause: null });
  }

  const lineOf = (field: DraftField, hint?: string): string | null =>
    errors[field] !== undefined ? errorCopy.forCode(errors[field]) : (hint ?? null);
  const figuresNote =
    errors.figures !== undefined ? (
      <p id={fieldId("figures")} tabIndex={-1} className={`${fieldErrorClass}`}>
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
                returnFocusTo={picker.shown.opener}
                recipeName={draft.name}
                editing={picker.shown.value}
                onAdd={(line) => setLines((lines) => [...lines, { ...line, id: newId() }])}
                onSave={(line) => setLines((lines) => lines.map((l) => (l.id === line.id ? line : l)))}
                onRemove={(lineId) => setLines((lines) => lines.filter((l) => l.id !== lineId))}
              />
            )}
            {plain.shown && (
              <NotCountedSheet
                key={`plain-${plain.shown.key}`}
                open={plain.isOpen}
                onClose={plain.close}
                returnFocusTo={plain.shown.opener}
                line={plain.shown.value}
                onAdd={(line) => setLines((lines) => [...lines, { ...line, id: newId() }])}
                onSave={(line) => setLines((lines) => lines.map((l) => (l.id === line.id ? line : l)))}
                onRemove={(lineId) => setLines((lines) => lines.filter((l) => l.id !== lineId))}
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
          <div className="grid grid-cols-2 gap-3">
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
            <IngredientRows
              lines={draft.lines.map(rowOf)}
              idPrefix={id}
              refused={lineRefusal}
              onOpen={(index, opener) => {
                const line = draft.lines[index];
                if (line.kind === "counted") picker.open(opener, line);
                else plain.open(opener, line);
              }}
            />
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
                onClick={(e) => picker.open(e.currentTarget, null)}
                className={btnWide}
              >
                {t("addIngredient")}
              </button>
              <button type="button" onClick={(e) => plain.open(e.currentTarget, null)} className={btnText}>
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
            />
          </div>
          <div className={sectionStart}>
            <label htmlFor={fieldId("method")} className={labelClass}>
              {t("method")}
            </label>
            <textarea
              id={fieldId("method")}
              name="method"
              rows={4}
              value={draft.method}
              onChange={(e) => change("method", e.target.value)}
              aria-invalid={errors.method !== undefined || undefined}
              aria-describedby={`${fieldId("method")}-line`}
              className={textareaClass}
            />
            <p
              id={`${fieldId("method")}-line`}
              className={`${errors.method ? fieldErrorClass : fieldHintClass} ${lineRoom}`}
            >
              {lineOf("method", t("methodHint"))}
            </p>
          </div>
          <div>
            <label htmlFor={fieldId("notes")} className={labelClass}>
              {t("notes")}
            </label>
            <textarea
              id={fieldId("notes")}
              name="notes"
              rows={3}
              value={draft.notes}
              onChange={(e) => change("notes", e.target.value)}
              aria-invalid={errors.notes !== undefined || undefined}
              aria-describedby={`${fieldId("notes")}-line`}
              className={`${textareaClass} min-h-24!`}
            />
            <p
              id={`${fieldId("notes")}-line`}
              className={`${errors.notes ? fieldErrorClass : fieldHintClass} ${lineRoom}`}
            >
              {lineOf("notes")}
            </p>
          </div>
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
