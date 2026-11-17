"use client";

import { btnSecondary } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// CreateActions: the first controls under the search field while browsing,
// two equal buttons in one row: "New saved meal" and "Add an estimate". Each
// opens its sheet on top of the log sheet. Inside the browse view's armed
// container, so the second tap of a double tap on the launcher opens nothing.
// ---------------------------------------------------------------------------

export interface CreateActionsProps {
  onNewMeal: (opener: HTMLElement) => void;
  onEstimate: (opener: HTMLElement) => void;
}

export function CreateActions({ onNewMeal, onEstimate }: CreateActionsProps): ReactElement {
  const t = useTranslations("log.browse");
  return (
    <div data-create-actions="" className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={(e) => onNewMeal(e.currentTarget)}
        className={`${btnSecondary} h-auto! min-h-12 px-3 py-2 text-center`}
      >
        {t("newMeal")}
      </button>
      <button
        type="button"
        onClick={(e) => onEstimate(e.currentTarget)}
        className={`${btnSecondary} h-auto! min-h-12 px-3 py-2 text-center`}
      >
        {t("addEstimate")}
      </button>
    </div>
  );
}
