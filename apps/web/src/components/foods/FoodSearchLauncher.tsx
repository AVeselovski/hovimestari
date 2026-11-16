"use client";

import { Icon } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { FoodSheet } from "./FoodSheet";

/**
 * The way into the food sheet: a full-width button drawn like a search field,
 * with the search icon and "Search foods". It keeps the sheet mounted while
 * it slides out, with a fresh one on every open.
 */
export function FoodSearchLauncher(): ReactElement {
  const t = useTranslations("day");
  const sheet = useSheetTarget();
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={(e) => sheet.open(e.currentTarget)}
        className={`flex h-12 w-full items-center gap-3 rounded-control border border-field-rule bg-surface-raised px-3.5 text-left text-base text-ink-muted hover:text-ink active:bg-surface ${focusRing}`}
      >
        <Icon name="search" className="size-5 shrink-0" />
        {t("launcher")}
      </button>
      {sheet.shown && (
        <FoodSheet key={sheet.shown.key} open={sheet.isOpen} onClose={sheet.close} returnFocusTo={sheet.shown.opener} />
      )}
    </>
  );
}
