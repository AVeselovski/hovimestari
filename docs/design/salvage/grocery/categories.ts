import type { AisleCategory } from "@hovi/shared";

export type CategoryEntry = { id: AisleCategory; label: string };

export const CATEGORIES: CategoryEntry[] = [
  { id: "produce", label: "Hedelmät & vihannekset" },
  { id: "bakery", label: "Leipä & leivonnaiset" },
  { id: "meat-fish", label: "Liha & kala" },
  { id: "dairy", label: "Maitotuotteet & munat" },
  { id: "frozen", label: "Pakaste" },
  { id: "pantry", label: "Kuivatuotteet & säilykkeet" },
  { id: "drinks", label: "Juomat" },
  { id: "other", label: "Muut" },
];

export const CAT_ORDER: Record<AisleCategory, number> = CATEGORIES.reduce(
  (acc, c, i) => {
    acc[c.id] = i;
    return acc;
  },
  {} as Record<AisleCategory, number>,
);

export function catLabel(id: AisleCategory): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Muut";
}
