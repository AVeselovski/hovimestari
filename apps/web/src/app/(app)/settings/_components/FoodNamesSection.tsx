"use client";

import { Card } from "@/components/ui/Card";
import {
  fieldErrorClass,
  fieldHintClass,
  segmentActive,
  segmentButton,
  segmentInactive,
  segmentedTray,
} from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useRovingChoice } from "@/hooks/useRovingChoice";
import { updateSettings } from "@/lib/api/settings";
import { afterFoodNameLanguageChange } from "@/lib/invalidation";
import { meQuery } from "@/lib/queryOptions";
import { FOOD_NAME_LANGUAGES, type FoodNameLanguage } from "@hovimestari/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type ReactElement } from "react";

/**
 * The language food names are shown in, Finnish or English. Saved as soon as
 * it is chosen. The choice shows at once, and goes back with a line saying
 * why when the save fails.
 */
export function FoodNamesSection(): ReactElement {
  const t = useTranslations("settings.foodNames");
  const errors = useErrorCopy();
  const client = useQueryClient();
  const { user, status } = useAuth();
  const { data: me } = useQuery({ ...meQuery(), enabled: status === "authenticated" });
  const saved = (me ?? user)?.foodNameLanguage ?? null;
  const [pending, setPending] = useState<FoodNameLanguage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chosen = pending ?? saved;

  async function choose(next: FoodNameLanguage): Promise<void> {
    if (next === chosen) return;
    setError(null);
    setPending(next);
    try {
      const answered = await updateSettings({ foodNameLanguage: next });
      await afterFoodNameLanguageChange(client, answered);
    } catch (err) {
      setError(errors.forError(err));
    }
    setPending((current) => (current === next ? null : current));
  }

  const roving = useRovingChoice(FOOD_NAME_LANGUAGES, chosen, (next) => void choose(next));

  return (
    <Card labelledBy="settings-food-names">
      <Card.Header id="settings-food-names" title={t("title")} />
      <div
        role="radiogroup"
        aria-labelledby="settings-food-names"
        aria-describedby="settings-food-names-line"
        className={`${segmentedTray} grid-cols-2`}
      >
        {FOOD_NAME_LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            role="radio"
            aria-checked={chosen === lang}
            onClick={() => void choose(lang)}
            {...roving.optionProps(lang)}
            className={`${segmentButton} ${chosen === lang ? segmentActive : segmentInactive}`}
          >
            {lang === "fi" ? t("fi") : t("en")}
          </button>
        ))}
      </div>
      <p
        id="settings-food-names-line"
        role={error ? "alert" : undefined}
        className={`${error ? fieldErrorClass : fieldHintClass} min-h-5`}
      >
        {error ?? t("hint")}
      </p>
    </Card>
  );
}
