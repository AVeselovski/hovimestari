"use client";

import { actionPair, actionPairButton } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// CreateActions: the first controls under the search field while browsing,
// two equal buttons in one row: "New meal" and "Add an estimate". Each
// opens its sheet on top of the log sheet. Inside the browse view's armed
// container, so the second tap of a double tap on the launcher opens nothing.
// ---------------------------------------------------------------------------

export interface CreateActionsProps {
  onNewMeal: (opener: HTMLElement) => void;
  onEstimate: (opener: HTMLElement) => void;
}

export function CreateActions({ onNewMeal, onEstimate }: CreateActionsProps): ReactElement {
  const t = useTranslations("log.browse");
  const tLists = useTranslations("lists");
  return (
    <div data-create-actions="" className={actionPair}>
      <button type="button" onClick={(e) => onNewMeal(e.currentTarget)} className={actionPairButton}>
        {tLists("newMeal")}
      </button>
      <button type="button" onClick={(e) => onEstimate(e.currentTarget)} className={actionPairButton}>
        {t("addEstimate")}
      </button>
    </div>
  );
}
