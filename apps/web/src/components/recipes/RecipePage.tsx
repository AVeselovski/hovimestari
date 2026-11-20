"use client";

import { FavouriteButton } from "@/components/foods/FavouriteButton";
import { Icon } from "@/components/Icon";
import { PageContainer } from "@/components/ui/PageContainer";
import {
  btnPrimary,
  btnSecondary,
  btnText,
  btnTextDanger,
  focusRing,
  noticeClass,
  sectionTitle,
  tagClass,
} from "@/components/ui/styles";
import { useToast } from "@/components/ui/Toast";
import { useEntryActions } from "@/hooks/useEntryActions";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { getErrorCode } from "@/lib/errors";
import { formatDayShort } from "@/lib/localDate";
import { queryKeys } from "@/lib/queryKeys";
import { recipeQuery } from "@/lib/queryOptions";
import { markOpenedInApp, scrollPageToTop, setFocusAfterDelete, takeOpenedInApp } from "@/lib/recipeNav";
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
import { useId, useLayoutEffect, useState, type ReactElement } from "react";
import { IngredientRows } from "./IngredientRows";
import { servingsOf } from "./recipeDraft";
import { RecipeEditorSheet } from "./RecipeEditorSheet";
import { RecipeFigures } from "./RecipeFigures";
import { RecipeLogSheet } from "./RecipeLogSheet";
import { useRecipeActions } from "./useRecipeActions";
import { useRecipeDelete } from "./useRecipeDelete";
import { useRecipeMeta } from "./useRecipeMeta";

// ---------------------------------------------------------------------------
// RecipePage: one recipe, at /recipes/<id>. Top to bottom: Back and Edit;
// the name in the display face with its star; "Serves 2 · 25 min", the tags
// and the last day it is on; the figures card with its servings stepper;
// Log; the ingredients, scaled with the stepper; the method's numbered
// steps and the notes; then Duplicate, Archive recipe and Delete recipe.
//
// - The stepper scales the lines with `scaleRecipe` and the figures with
//   `entryFigures` on the recipe's basis, the figures a day shows for that
//   many servings. The card's height never changes, so stepping moves
//   nothing under it.
// - Opened from a row, the page shows the row's name, servings and figures
//   from the list at once, and the rest in its room as the recipe is read.
// - Back goes back where the page was opened from inside the app, with its
//   search and scroll as they were, else to the Recipes tab.
// - An archived recipe says so under its name and can still be logged. A
//   deleted one, opened from a day's entry, says days it was on keep their
//   figures, and offers nothing to change.
// - After a delete the page leaves for the Recipes tab, where the next row
//   takes focus.
// ---------------------------------------------------------------------------

export function RecipePage({ id }: { id: string }): ReactElement {
  const t = useTranslations("recipes.page");
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const { today } = useToday();
  const meta = useRecipeMeta();
  const headingId = useId();
  const [openedInApp] = useState(takeOpenedInApp);
  // The page opens at its top: <main> keeps the scroll of the list it was opened from.
  useLayoutEffect(scrollPageToTop, []);
  const query = useQuery(recipeQuery(id));
  const listed = (client.getQueryData<RecipeList>(queryKeys.recipeList(false))?.recipes ?? [])
    .concat(client.getQueryData<RecipeList>(queryKeys.recipeList(true))?.recipes ?? [])
    .find((r) => r.id === id);
  const recipe: Recipe | undefined = query.data;
  const summary = recipe ?? listed;

  const [stepText, setStepText] = useState<string | null>(null);
  const editor = useSheetTarget<"edit" | "copy">();
  const logSheet = useSheetTarget();
  const actions = useRecipeActions();
  const entryActions = useEntryActions(null);
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
    router.replace("/recipes");
  }
  const remove = useRecipeDelete({ onDone: leave, focusAfter: () => null });

  const back = (): void => {
    if (openedInApp) router.back();
    else router.push("/recipes");
  };

  const gone = getErrorCode(query.error) === "recipe_not_found";
  const unreachable = summary === undefined && !gone && (query.isError || query.fetchStatus === "paused");

  const topRow = (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <button
        type="button"
        onClick={back}
        className={`-ml-2 inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-base font-semibold text-ink hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
      >
        <Icon name="chevronLeft" className="size-5" strokeWidth={2} />
        {t("back")}
      </button>
      {recipe && !recipe.deleted && (
        <button type="button" onClick={(e) => editor.open(e.currentTarget, "edit")} className={btnSecondary}>
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
          <p className="text-lg text-ink">{gone ? t("gone") : t("offline")}</p>
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
            <h1 className="min-h-10 min-w-0 flex-1 font-display text-3xl font-medium break-words text-ink md:min-h-11 md:text-4xl">
              {summary?.name}
            </h1>
            {summary && !deleted && (
              <FavouriteButton
                on={summary.favourite}
                onToggle={() =>
                  void actions.setFavourite(summary, !summary.favourite).then((line) => {
                    if (line !== null) toast.show({ message: line });
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
          {summary?.lastPutOn && (
            <p className="mt-2 text-sm text-ink-muted">
              {t("onDay", { date: formatDayShort(summary.lastPutOn, undefined, today ?? undefined) })}
            </p>
          )}
          {deleted ? (
            <p className={`${noticeClass} mt-4`}>{t("deletedNote")}</p>
          ) : archived ? (
            <p className={`${noticeClass} mt-4`}>{t("archivedNote")}</p>
          ) : null}
        </header>
        <RecipeFigures headingId={headingId} perServing={perServing} whole={whole} stepper={stepper} />
        {summary && !deleted && (
          <button type="button" onClick={(e) => logSheet.open(e.currentTarget)} className={`${btnPrimary} w-full`}>
            {t("log")}
          </button>
        )}
        {lines && (
          <section aria-labelledby={`${headingId}-ingredients`}>
            <h2 id={`${headingId}-ingredients`} className={`${sectionTitle} mb-1`}>
              {t("ingredients")}
            </h2>
            <IngredientRows idPrefix={headingId} lines={lines} />
          </section>
        )}
        {recipe && recipe.steps.length > 0 && (
          <section aria-labelledby={`${headingId}-method`}>
            <h2 id={`${headingId}-method`} className={`${sectionTitle} mb-2`}>
              {t("method")}
            </h2>
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
            <h2 id={`${headingId}-notes`} className={`${sectionTitle} mb-2`}>
              {t("notes")}
            </h2>
            <p className="text-base leading-7 break-words whitespace-pre-line text-ink">{recipe.notes}</p>
          </section>
        )}
        {recipe && !deleted && (
          <div className="flex flex-col items-start border-t border-rule pt-4">
            <button type="button" onClick={(e) => editor.open(e.currentTarget, "copy")} className={btnText}>
              {t("duplicate")}
            </button>
            <button
              type="button"
              aria-busy={actions.busyId === recipe.id || undefined}
              onClick={() =>
                void actions.setArchived(recipe, !recipe.archived).then((line) =>
                  toast.show({
                    message:
                      line ??
                      (recipe.archived
                        ? t("restoredToast", { name: recipe.name })
                        : t("archivedToast", { name: recipe.name })),
                  }),
                )
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
            if (!created) return;
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
      {remove.dialog}
    </PageContainer>
  );
}
