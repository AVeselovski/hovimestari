"use client";

import { Icon } from "@/components/Icon";
import {
  btnSecondary,
  btnTextDanger,
  errorTextClass,
  focusRing,
  noticeClass,
  sectionTitle,
} from "@/components/ui/styles";
import { foodNameLangs, useFoodNameLanguage } from "@/hooks/useFoodNameLanguage";
import { formatGrams } from "@/lib/foodFormat";
import type { FoodDetail as FoodDetailData, FoodSummary, Portion } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import type { ReactElement, Ref } from "react";
import { FavouriteButton } from "./FavouriteButton";
import { FoodSourceLine } from "./FoodSourceLine";
import { Per100gFigures } from "./Per100gFigures";

// ---------------------------------------------------------------------------
// The log sheet's food view, under its log block. The header holds Back, the
// food's name on one line, and the favourite star. The body scrolls under it and holds the food's name, the other
// language's name, where the figures come from, the figures per 100 g, the
// portions, for the user's own food Edit and Delete, and for an Open Food
// Facts food, which nobody edits, Copy to your foods. The name scrolls
// with the body, so a long one never squeezes the body under a fixed header.
// Edit shows once the detail has loaded, since the form opens on what was
// saved. Until the detail has loaded it shows the row it was opened from, so
// the name and figures are there at once.
//
// The screen shows the API's figures and computes none.
// ---------------------------------------------------------------------------

export interface FoodDetailHeaderProps {
  /** The food's or the meal's name, on one line between Back and the star. */
  name: string;
  /** The food's star. A view with no star (a saved meal) leaves both out. */
  favourite?: boolean;
  onToggleFavourite?: () => void;
  onBack: () => void;
  backRef?: Ref<HTMLButtonElement>;
  /** The name's language, for its hyphenation and its voice. */
  lang?: string;
}

/**
 * A view's header row: Back, the name cut to one line (the body shows it in
 * full), and the favourite star. Always one 44 px row, so moving between
 * views moves nothing under it.
 */
export function FoodDetailHeader({
  name,
  favourite,
  onToggleFavourite,
  onBack,
  backRef,
  lang,
}: FoodDetailHeaderProps): ReactElement {
  const t = useTranslations("foods.detail");
  return (
    <div className="pb-1">
      <div className="-mx-2 flex items-center gap-1">
        <button
          ref={backRef}
          type="button"
          onClick={onBack}
          className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-control px-2 text-base font-semibold text-ink hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
        >
          <Icon name="chevronLeft" className="size-5" strokeWidth={2} />
          {t("back")}
        </button>
        <p
          lang={lang}
          aria-hidden="true"
          data-view-name=""
          className="min-w-0 flex-1 truncate text-base text-ink-muted"
        >
          {name}
        </p>
        {favourite !== undefined && onToggleFavourite ? (
          <FavouriteButton on={favourite} onToggle={onToggleFavourite} />
        ) : (
          <span aria-hidden="true" className="size-11 shrink-0" />
        )}
      </div>
    </div>
  );
}

/** The attribute Add a portion carries, so focus can find it after a portion is deleted. */
export const ADD_PORTION_ATTRIBUTE = "data-add-portion";

/** A portion's label: Fineli's measure from the catalog, or the user's own name. */
export function usePortionLabel(): (portion: Portion) => string {
  const t = useTranslations("foods.portionUnits");
  return (portion) => (portion.unit ? t(portion.unit) : (portion.name ?? ""));
}

export interface FoodDetailBodyProps {
  /** The row it was opened from, until the detail loads. */
  summary: FoodSummary;
  detail: FoodDetailData | undefined;
  /** The detail could not be read, for a reason other than the food being gone. */
  unavailable: boolean;
  /** Why the last favourite mark failed, or null. */
  favouriteError: string | null;
  onLeave: () => void;
  onAddPortion: (opener: HTMLElement) => void;
  onEditPortion: (portion: Portion, opener: HTMLElement) => void;
  /** Opens the edit form on the loaded detail. Edit food shows only once the detail is there. */
  onEdit: (detail: FoodDetailData, opener: HTMLElement) => void;
  onDelete: (opener: HTMLElement) => void;
  /** Opens the own-food form filled in from this Open Food Facts food, so the person can correct it. */
  onCopy: (detail: FoodDetailData, opener: HTMLElement) => void;
}

export function FoodDetailBody({
  summary,
  detail,
  unavailable,
  favouriteError,
  onLeave,
  onAddPortion,
  onEditPortion,
  onEdit,
  onDelete,
  onCopy,
}: FoodDetailBodyProps): ReactElement {
  const t = useTranslations("foods.detail");
  const portionLabel = usePortionLabel();
  const food = detail ?? summary;
  const lang = foodNameLangs(food, useFoodNameLanguage());
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        {/* Always in the page, so a screen reader announces a failure as it arrives. */}
        <p role="alert" className={`${errorTextClass} empty:hidden`}>
          {favouriteError}
        </p>
        <h2
          lang={lang.name}
          className="font-display text-2xl font-medium break-words hyphens-auto text-balance text-ink"
        >
          {food.name}
        </h2>
        {food.otherName !== null && (
          <p lang={lang.other} className="text-base break-words hyphens-auto text-ink-muted">
            {food.otherName}
          </p>
        )}
        <FoodSourceLine source={food.source} barcode={detail?.barcode} onLeave={onLeave} />
      </div>
      {food.retired && <p className={noticeClass}>{t("retired")}</p>}
      <section aria-labelledby="food-per-100g">
        <h3 id="food-per-100g" className={`${sectionTitle} mb-2`}>
          {t("per100g")}
        </h3>
        <Per100gFigures figures={food.per100g} />
      </section>
      <section aria-labelledby="food-portions">
        <h3 id="food-portions" className={`${sectionTitle} mb-2`}>
          {t("portions")}
        </h3>
        {detail === undefined ? (
          unavailable && <p className="text-base text-ink-muted">{t("portionsUnavailable")}</p>
        ) : (
          <>
            {detail.portions.length === 0 ? (
              <p className="py-2 text-base text-ink-muted">{t("noPortions")}</p>
            ) : (
              <ul className="divide-y divide-rule border-y border-rule">
                {detail.portions.map((portion) => (
                  <li key={portion.id}>
                    <PortionRow
                      label={portionLabel(portion)}
                      grams={t("grams", { value: formatGrams(portion.grams) })}
                      editLabel={portion.isOwn ? t("editPortion", { portion: portionLabel(portion) }) : null}
                      onEdit={(opener) => onEditPortion(portion, opener)}
                    />
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              {...{ [ADD_PORTION_ATTRIBUTE]: "" }}
              onClick={(e) => onAddPortion(e.currentTarget)}
              className={`${btnSecondary} mt-3 w-full`}
            >
              <Icon name="plus" className="size-5" />
              {t("addPortion")}
            </button>
          </>
        )}
      </section>
      {food.source === "open_food_facts" && detail !== undefined && (
        <div className="border-t border-rule pt-4">
          <button type="button" onClick={(e) => onCopy(detail, e.currentTarget)} className={`${btnSecondary} w-full`}>
            {t("copyToOwn")}
          </button>
        </div>
      )}
      {food.isOwn && (
        <div className="flex flex-col items-start gap-2 border-t border-rule pt-4">
          {detail !== undefined && (
            <button type="button" onClick={(e) => onEdit(detail, e.currentTarget)} className={`${btnSecondary} w-full`}>
              <Icon name="pencil" className="size-5" />
              {t("edit")}
            </button>
          )}
          <button type="button" onClick={(e) => onDelete(e.currentTarget)} className={btnTextDanger}>
            {t("delete")}
          </button>
        </div>
      )}
    </div>
  );
}

/** A portion: its label and weight. The user's own portion is a button that opens it for editing. */
function PortionRow({
  label,
  grams,
  editLabel,
  onEdit,
}: {
  label: string;
  grams: string;
  editLabel: string | null;
  onEdit: (opener: HTMLElement) => void;
}): ReactElement {
  const content = (
    <>
      <span className="min-w-0 flex-1 text-left text-base break-words text-ink">{label}</span>
      <span className="font-mono text-base text-ink tabular-nums">{grams}</span>
    </>
  );
  if (editLabel === null) return <div className="flex min-h-12 items-center gap-3 py-2">{content}</div>;
  return (
    <button
      type="button"
      aria-label={editLabel}
      onClick={(e) => onEdit(e.currentTarget)}
      className={`flex min-h-12 w-full items-center gap-3 py-2 hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
    >
      {content}
      <Icon name="pencil" className="size-5 shrink-0 text-ink-muted" />
    </button>
  );
}
