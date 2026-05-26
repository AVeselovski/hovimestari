import type { AisleCategory, State } from "@hovi/shared";
import { CATEGORIES } from "./categories.js";

export type ShoppingItem = {
  name: string;
  amount: string;
  unit: string;
  category: AisleCategory;
  sources: string[];
};

export type ShoppingGroup = {
  id: AisleCategory;
  label: string;
  items: ShoppingItem[];
};

type Raw = {
  name: string;
  amount: string;
  unit: string;
  category: AisleCategory;
  source: string;
};

export function buildShoppingList(state: State): ShoppingGroup[] {
  const items: Raw[] = [];

  const enabledGroupIds = new Set(
    state.stapleGroups.filter((g) => g.enabled).map((g) => g.id),
  );

  for (const s of state.staples) {
    if (!s.enabled) continue;
    if (!enabledGroupIds.has(s.groupId)) continue;
    items.push({
      name: s.name,
      amount: s.amount,
      unit: s.unit,
      category: s.category,
      source: "vakio",
    });
  }

  for (const rid of state.plan.selectedRecipeIds) {
    const r = state.recipes.find((rr) => rr.id === rid);
    if (!r) continue;
    for (const ing of r.ingredients) {
      items.push({
        name: ing.name,
        amount: ing.amount,
        unit: ing.unit,
        category: ing.category,
        source: r.name,
      });
    }
  }

  const merged = new Map<string, ShoppingItem>();
  for (const it of items) {
    const key = `${it.category}::${it.name.toLowerCase().trim()}`;
    const existing = merged.get(key);
    if (existing) {
      existing.amount = `${existing.amount} + ${it.amount}`;
      if (!existing.sources.includes(it.source)) existing.sources.push(it.source);
    } else {
      merged.set(key, {
        name: it.name,
        amount: it.amount,
        unit: it.unit,
        category: it.category,
        sources: [it.source],
      });
    }
  }

  const all = [...merged.values()];
  return CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    items: all
      .filter((it) => it.category === c.id)
      .sort((a, b) => a.name.localeCompare(b.name, "fi")),
  })).filter((g) => g.items.length > 0);
}
