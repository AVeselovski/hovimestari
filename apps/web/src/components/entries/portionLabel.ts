import type { FineliPortionUnit } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

/** A portion's name for a reader: the catalog's unit name for a Fineli portion, else the user's own name. */
export function usePortionChipLabel(): (portion: { unit: FineliPortionUnit | null; name: string | null }) => string {
  const t = useTranslations("foods.portionUnits");
  return useCallback((portion) => (portion.unit ? t(portion.unit) : (portion.name ?? "")), [t]);
}
