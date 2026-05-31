import type { AisleCategory, State } from "@hovi/shared";
import { CATEGORIES } from "./categories.js";
import { formatShoppingAmount, scaleAmount } from "./amount.js";

export type ShoppingContributor = {
  amount: number | null;
  unit: string;
};

export type ShoppingItem = {
  name: string;
  contributors: ShoppingContributor[];
  // First contributor's unit, retained for backward-compat / debugging. The
  // canonical render string is `display`, which already encodes units across
  // every contributor.
  unit: string;
  display: string;
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
  amount: number | null;
  unit: string;
  category: AisleCategory;
  source: string;
};

type Working = {
  name: string;
  contributors: ShoppingContributor[];
  category: AisleCategory;
  sources: string[];
};

function renderContributor(c: ShoppingContributor): string {
  const amt = formatShoppingAmount(c.amount, c.unit);
  if (amt === "") return c.unit;
  if (c.unit === "") return amt;
  return `${amt} ${c.unit}`;
}

function buildDisplay(contributors: ShoppingContributor[]): string {
  return contributors.map(renderContributor).join(" + ");
}

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

  for (const pr of state.plan.selectedRecipes) {
    const r = state.recipes.find((rr) => rr.id === pr.recipeId);
    if (!r) continue;
    const base = r.servings;
    for (const ing of r.ingredients) {
      items.push({
        name: ing.name,
        amount: scaleAmount(ing.amount, pr.servings, base),
        unit: ing.unit,
        category: ing.category,
        source: r.name,
      });
    }
  }

  const merged = new Map<string, Working>();
  for (const it of items) {
    const key = `${it.category}::${it.name.toLowerCase().trim()}`;
    const existing = merged.get(key);
    if (existing) {
      existing.contributors.push({ amount: it.amount, unit: it.unit });
      if (!existing.sources.includes(it.source)) existing.sources.push(it.source);
    } else {
      merged.set(key, {
        name: it.name,
        contributors: [{ amount: it.amount, unit: it.unit }],
        category: it.category,
        sources: [it.source],
      });
    }
  }

  const all: ShoppingItem[] = [...merged.values()].map((w) => ({
    name: w.name,
    contributors: w.contributors,
    unit: w.contributors[0]?.unit ?? "",
    display: buildDisplay(w.contributors),
    category: w.category,
    sources: w.sources,
  }));

  return CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    items: all
      .filter((it) => it.category === c.id)
      .sort((a, b) => a.name.localeCompare(b.name, "fi")),
  })).filter((g) => g.items.length > 0);
}
