"use client";

import { FavouriteButton } from "@/components/foods/FavouriteButton";
import { Icon } from "@/components/Icon";
import { PageContainer } from "@/components/ui/PageContainer";
import {
  backButton,
  btnPrimary,
  btnSecondary,
  btnText,
  btnTextDanger,
  noticeClass,
  sectionTitle,
  tagClass,
} from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useEntryActions } from "@/hooks/useEntryActions";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { getErrorCode } from "@/lib/errors";
import { OfflineError } from "@/lib/failure";
import { formatDayShort } from "@/lib/localDate";
import { queryKeys } from "@/lib/queryKeys";
import { recipeQuery } from "@/lib/queryOptions";
import { markOpenedInApp, scrollPageToTop, setFocusAfterDelete, takeOpenedInApp } from "@/lib/recipeNav";
import { heldRecipeForForm, readRecipeForForm } from "@/lib/recipeRead";
import {
  entryFigures,
  scaleRecipe,
  sortRecipes,
  type Recipe,
  type RecipeList,
  type RecipeSummary,
} from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { IngredientRows } from "./IngredientRows";
import { servingsOf } from "./recipeDraft";
import { RecipeEditorSheet } from "./RecipeEditorSheet";
import { RecipeFigures } from "./RecipeFigures";
import { RecipeLogSheet } from "./RecipeLogSheet";
import { useCookSheet } from "./useCookSheet";
import { useRecipeActions } from "./useRecipeActions";
import { useRecipeDelete } from "./useRecipeDelete";
import { useRecipeMeta } from "./useRecipeMeta";

// ---------------------------------------------------------------------------
// RecipePage: one recipe, at /recipes/<id>. Top to bottom: Back and Edit;
// the name in the display face with its star; "Serves 2 · 25 min", the tags
// and the last day it is on; the figures card with its servings stepper;
// Log and Log as made; the ingredients, scaled with the stepper; the
// method's numbered steps and the notes; then Duplicate, Archive recipe and
// Delete recipe.
//
// - The stepper scales the lines with `scaleRecipe` and the figures with
//   `entryFigures` on the recipe's basis, the figures a day shows for that
//   many servings. The card's height never changes, so stepping moves
//   nothing under it.
// - Opened from a row, the page shows the row's name, servings and figures
//   from the list at once, and the rest in its room as the recipe is read.
//   A read that fails says so where the rest would show.
// - The last day's line keeps its room while the recipe is on no day, so
//   the line showing after a Log from this page moves nothing under it.
//   Every entry write reads the recipe again (lib/invalidation.ts).
// - The shell's title, the tab's name, is the page's one level 1 heading.
//   The recipe's name is the level 2 heading under it, and takes focus as
//   the page arrives, so a keyboard and a screen reader start at the recipe.
//   The browser's title names the recipe.
// - Edit and Duplicate open on the recipe as the server holds it: a recipe
//   read within the stale time and not changed since opens at once, else it
//   is read first, since a save sends the whole recipe and would write an
//   older copy over an edit made elsewhere, such as by a connected assistant.
// - Back goes back where the page was opened from inside the app, the list
//   or the day as it was left (lib/recipeNav.ts), else to the Recipes tab.
// - An archived recipe says so under its name and can still be logged. A
//   deleted one, opened from a day's entry, says days it was on keep their
//   figures, and offers nothing to change.
// - After a delete the page leaves for the Recipes tab, where the next row
//   takes focus.
// - The star and Archive wait while the app asks the server for today, and
//   say so (`aria-disabled`).
// - Log as made opens the batch sheet (`useCookSheet`) with no entry: made
//   today, with a first row of new servings for today.
// ---------------------------------------------------------------------------

export function RecipePage({ id }: { id: string }): ReactElement {
  const t = useTranslations("recipes.page");
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const errors = useErrorCopy();
  const offlineLine = useFailureLine("form");
  const offline = useKnownOffline();
  const { today } = useToday();
  const meta = useRecipeMeta();
  const headingId = useId();
  const nameRef = useRef<HTMLHeadingElement>(null);
  const [openedInApp] = useState(takeOpenedInApp);
  // The page opens at its top: <main> keeps the scroll of the list it was opened from.
  useLayoutEffect(scrollPageToTop, []);
  const query = useQuery(recipeQuery(id));
  const listed = (client.getQueryData<RecipeList>(queryKeys.recipeList(false))?.recipes ?? [])
    .concat(client.getQueryData<RecipeList>(queryKeys.recipeList(true))?.recipes ?? [])
    .find((r) => r.id === id);
  const recipe: Recipe | undefined = query.data;
  const summary = recipe ?? listed;
  useDocumentTitle(summary?.name);

  // The name takes focus once, as the page arrives, unless focus is already somewhere on the page.
  const named = summary !== undefined;
  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (!named || arrived.current) return;
    arrived.current = true;
    if (document.activeElement === null || document.activeElement === document.body) {
      nameRef.current?.focus({ preventScroll: true });
    }
  }, [named]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [stepText, setStepText] = useState<string | null>(null);
  const editor = useSheetTarget<"edit" | "copy">();
  const logSheet = useSheetTarget();
  const actions = useRecipeActions();
  const entryActions = useEntryActions(null);
  // The button whose press is reading the recipe before the editor opens.
  const [opening, setOpening] = useState<"edit" | "copy" | null>(null);
  const opens = useRef(0);
  // The page has no sheet open when a read for Log as made fails, so a toast says why. A read that
  // answers after Edit, Make a copy or Log was pressed opens nothing: the page shows one sheet.
  const cook = useCookSheet(entryActions, {
    mayOpen: () => opening === null && !editor.isOpen && !logSheet.isOpen,
    onReadFailed: (line) => toast.show({ message: line }),
  });

  /** After a delete: the Recipes tab, where the next row by name takes focus, else the one before, else New recipe. */
  function leave(gone: RecipeSummary): void {
    const rows = sortRecipes(
      client.getQueryData<RecipeList>(queryKeys.recipeList(gone.archived))?.recipes ?? [],
      "name",
    );
    const at = rows.findIndex((r) => r.id === gone.id);
    const next = at === -1 ? undefined : (rows[at + 1] ?? rows[at - 1]);
    setFocusAfterDelete(next ? next.id : "new");
    toast.show({ message: t("deletedToast", { name: gone.name }) });
    // The list brings the row it focuses into view itself, so the router leaves the scroll alone.
    router.replace("/recipes", { scroll: false });
  }
  const remove = useRecipeDelete({ onDone: leave, focusAfter: () => null });

  const back = (): void => {
    if (openedInApp) router.back();
    else router.push("/recipes");
  };

  /**
   * Opens the editor on the recipe, or on a copy of it. On a read that is
   * fresh (within the stale time and not invalidated since) it opens at
   * once, and offline on what was last read. Otherwise the recipe is read
   * first, the button busy meanwhile, and the editor opens on that answer.
   */
  async function openEditor(opener: HTMLElement, mode: "edit" | "copy"): Promise<void> {
    opens.current += 1;
    const ticket = opens.current;
    const current = (): boolean => ticket === opens.current && mounted.current;
    if (heldRecipeForForm(client, id, offline)) {
      editor.open(opener, mode);
      return;
    }
    setOpening(mode);
    try {
      const read = await readRecipeForForm(client, id, offline);
      if (!current()) return;
      if (read === null) toast.show({ message: offlineLine(new OfflineError()) });
      else editor.open(opener, mode);
    } catch (err) {
      // A recipe that is gone shows as gone on the page itself.
      if (current() && getErrorCode(err) !== "recipe_not_found") toast.show({ message: errors.forError(err) });
    } finally {
      if (current()) setOpening(null);
    }
  }

  const gone = getErrorCode(query.error) === "recipe_not_found";
  const failed = !gone && recipe === undefined && (query.isError || query.fetchStatus === "paused");
  // Why the recipe cannot be shown: no connection, or a read that failed.
  const failedLine = query.fetchStatus === "paused" || offline ? t("offline") : t("unavailable");
  const unreachable = summary === undefined && failed;

  // The row keeps Edit's height, 48px, so Edit arriving with the recipe moves nothing under it.
  const topRow = (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <button type="button" onClick={back} className={`${backButton} -ml-2`}>
        <Icon name="chevronLeft" className="size-5" strokeWidth={2} />
        {t("back")}
      </button>
      {recipe && !recipe.deleted && (
        <button
          type="button"
          aria-busy={opening === "edit" || undefined}
          onClick={(e) => void openEditor(e.currentTarget, "edit")}
          className={btnSecondary}
        >
          {t("edit")}
        </button>
      )}
    </div>
  );

  if (gone || unreachable) {
    return (
      <PageContainer>
        {topRow}
        <div className="mt-8 space-y-4">
          <p role={gone ? undefined : "status"} className="text-lg text-ink">
            {gone ? t("gone") : failedLine}
          </p>
          {gone && (
            <button type="button" onClick={() => router.push("/recipes")} className={btnText}>
              {t("backToRecipes")}
            </button>
          )}
        </div>
      </PageContainer>
    );
  }

  const shown = servingsOf(stepText ?? "") ?? summary?.servings ?? 1;
  const stepper =
    summary !== undefined
      ? {
          id: `${headingId}-servings`,
          text: stepText ?? String(summary.servings),
          shown,
          servings: summary.servings,
          touched: stepText !== null,
          onText: (text: string) => setStepText(text),
          onStep: (next: number) => setStepText(String(next)),
        }
      : undefined;
  const perServing = summary ? summary.perServing : null;
  const whole = summary ? entryFigures(summary.basis, { per: "serving", count: shown }) : null;
  const lines = recipe ? scaleRecipe(recipe.lines, recipe.servings, shown) : null;
  const deleted = recipe?.deleted ?? false;
  const archived = summary?.archived ?? false;

  return (
    <PageContainer clearToast>
      {topRow}
      <div className="mt-4 space-y-6" data-recipe-page="">
        <header>
          <div className="flex items-start gap-2">
            <h2
              ref={nameRef}
              tabIndex={-1}
              className="min-h-10 min-w-0 flex-1 font-display text-3xl font-medium break-words text-ink outline-hidden md:min-h-11 md:text-4xl"
            >
              {summary?.name}
            </h2>
            {summary && !deleted && (
              <FavouriteButton
                on={summary.favourite}
                held={actions.held}
                onToggle={() =>
                  void actions.setFavourite(summary, !summary.favourite).then((outcome) => {
                    if (!outcome.ok && outcome.failure !== null) toast.show({ message: outcome.failure });
                  })
                }
              />
            )}
          </div>
          <p className="mt-1 min-h-6 text-base text-ink-muted">{summary ? meta.serves(summary) : null}</p>
          {summary && summary.tags.length > 0 && (
            <ul aria-label={t("tags")} className="mt-3 flex flex-wrap gap-2">
              {summary.tags.map((tag) => (
                <li key={tag} className={tagClass}>
                  {tag}
                </li>
              ))}
            </ul>
          )}
          {/* Its room is kept while the recipe is on no day, so the line showing moves nothing under it. */}
          <p data-recipe-on-day="" className="mt-2 min-h-5 text-sm text-ink-muted">
            {summary?.lastPutOn
              ? t("onDay", { date: formatDayShort(summary.lastPutOn, undefined, today ?? undefined) })
              : null}
          </p>
          {deleted ? (
            <p className={`${noticeClass} mt-4`}>{t("deletedNote")}</p>
          ) : archived ? (
            <p className={`${noticeClass} mt-4`}>{t("archivedNote")}</p>
          ) : null}
        </header>
        <RecipeFigures
          headingId={headingId}
          perServing={perServing}
          whole={whole}
          stepper={stepper}
          stepperRoom
          busy={summary === undefined}
        />
        {summary && !deleted && (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={(e) => logSheet.open(e.currentTarget)} className={`${btnPrimary} w-full`}>
              {t("log")}
            </button>
            {/* A batch made another way than written: its own ingredients and servings, on one or several days. */}
            <button
              type="button"
              data-log-as-made=""
              aria-haspopup="dialog"
              aria-busy={cook.reading || undefined}
              // The batch starts on today, so the button waits until the app knows it, as the star and Archive do.
              aria-disabled={today === null || undefined}
              onClick={(e) => {
                if (today === null) return;
                // A press here takes the place of a read still out for the editor.
                opens.current += 1;
                setOpening(null);
                cook.open(e.currentTarget, { recipeId: id, day: today });
              }}
              className={`${btnSecondary} w-full`}
            >
              {t("logAsMade")}
            </button>
          </div>
        )}
        {failed && (
          <p role="status" className="text-base text-ink">
            {failedLine}
          </p>
        )}
        {lines && (
          <section aria-labelledby={`${headingId}-ingredients`}>
            <h3 id={`${headingId}-ingredients`} className={`${sectionTitle} mb-1`}>
              {t("ingredients")}
            </h3>
            <IngredientRows idPrefix={headingId} lines={lines} />
          </section>
        )}
        {recipe && recipe.steps.length > 0 && (
          <section aria-labelledby={`${headingId}-method`}>
            <h3 id={`${headingId}-method`} className={`${sectionTitle} mb-2`}>
              {t("method")}
            </h3>
            <ol className="list-decimal space-y-3 pl-6 text-base leading-7 text-ink marker:font-mono marker:text-ink-muted">
              {recipe.steps.map((step, i) => (
                <li key={i} className="pl-1 break-words">
                  {step}
                </li>
              ))}
            </ol>
          </section>
        )}
        {recipe?.notes && (
          <section aria-labelledby={`${headingId}-notes`}>
            <h3 id={`${headingId}-notes`} className={`${sectionTitle} mb-2`}>
              {t("notes")}
            </h3>
            <p className="text-base leading-7 break-words whitespace-pre-line text-ink">{recipe.notes}</p>
          </section>
        )}
        {recipe && !deleted && (
          <div className="flex flex-col items-start border-t border-rule pt-4">
            <button
              type="button"
              aria-busy={opening === "copy" || undefined}
              onClick={(e) => void openEditor(e.currentTarget, "copy")}
              className={btnText}
            >
              {t("duplicate")}
            </button>
            {/* One button that turns in place, so focus stays on it from Archive to Restore and back. */}
            <button
              type="button"
              aria-busy={actions.busyId === recipe.id || undefined}
              aria-disabled={actions.held || undefined}
              onClick={() =>
                void actions.setArchived(recipe, !recipe.archived).then((outcome) => {
                  // A press that sent nothing, while writes wait or another archive runs, says nothing.
                  if (outcome.ok) {
                    toast.show({
                      message: recipe.archived
                        ? t("restoredToast", { name: recipe.name })
                        : t("archivedToast", { name: recipe.name }),
                    });
                  } else if (outcome.failure !== null) toast.show({ message: outcome.failure });
                })
              }
              className={btnText}
            >
              {recipe.archived ? t("restore") : t("archive")}
            </button>
            <button type="button" onClick={(e) => remove.open(recipe, e.currentTarget)} className={btnTextDanger}>
              {t("delete")}
            </button>
          </div>
        )}
      </div>
      {editor.shown && recipe && (
        <RecipeEditorSheet
          key={`editor-${editor.shown.key}`}
          open={editor.isOpen}
          returnFocusTo={editor.shown.opener}
          onClose={editor.close}
          recipe={recipe}
          copy={editor.shown.value === "copy"}
          onSavedRecipe={(saved, created) => {
            // A copy saved after the person left this page opens nothing.
            if (!created || !mounted.current) return;
            markOpenedInApp();
            router.push(`/recipes/${saved.id}`);
          }}
          onDeleted={() => leave(recipe)}
          archive={{ busy: actions.busyId === recipe.id, set: (on) => actions.setArchived(recipe, on) }}
        />
      )}
      {logSheet.shown && summary && (
        <RecipeLogSheet
          key={`log-${logSheet.shown.key}`}
          open={logSheet.isOpen}
          returnFocusTo={logSheet.shown.opener}
          onClose={logSheet.close}
          recipe={summary}
          actions={entryActions}
        />
      )}
      {cook.sheet}
      {remove.dialog}
    </PageContainer>
  );
}
