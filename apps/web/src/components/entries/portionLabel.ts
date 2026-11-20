import { FINELI_PORTION_UNITS, type FineliPortionUnit } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

/** The catalog's names of Fineli's portion units. */
export type PortionUnitNames = ReturnType<typeof useTranslations<"foods.portionUnits">>;

const KNOWN_UNITS: ReadonlySet<string> = new Set(FINELI_PORTION_UNITS);

/**
 * A portion's name for a reader: a Fineli portion by its unit's name in the
 * catalog, else the person's own name. The unit comes first, as everywhere
 * a portion is named. Null for a unit this app has no name for, and for a
 * portion with no name, so the caller shows the amount without one rather
 * than a code.
 */
export function portionName(
  portion: { unit: string | null; name: string | null },
  units: PortionUnitNames,
): string | null {
  if (portion.unit !== null) return KNOWN_UNITS.has(portion.unit) ? units(portion.unit as FineliPortionUnit) : null;
  return portion.name !== null && portion.name.trim() !== "" ? portion.name : null;
}

/** A portion's name for a reader, as `portionName` gives it, or "" when it has none. */
export function usePortionChipLabel(): (portion: { unit: FineliPortionUnit | null; name: string | null }) => string {
  const t = useTranslations("foods.portionUnits");
  return useCallback((portion) => portionName(portion, t) ?? "", [t]);
}
