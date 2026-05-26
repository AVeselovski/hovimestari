import { Dices, ShoppingCart, Sparkles } from "lucide-react";
import type { State } from "@hovi/shared";
import { SectionHead } from "../components/SectionHead.js";
import { Toggle } from "../components/Toggle.js";
import { SelectedCard } from "../components/SelectedCard.js";
import { RecipeChip } from "../components/RecipeChip.js";
import { shuffle } from "../lib/shuffle.js";

export function PlanTab({
  state,
  mutate,
  goList,
}: {
  state: State;
  mutate: (updater: (s: State) => State) => void;
  goList: () => void;
}): JSX.Element {
  const selectedRecipes = state.plan.selectedRecipeIds
    .map((id) => state.recipes.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));
  const common = state.recipes.filter((r) => r.category === "common");
  const special = state.recipes.filter((r) => r.category === "special");

  const toggleRecipe = (id: string): void => {
    mutate((s) => {
      const has = s.plan.selectedRecipeIds.includes(id);
      return {
        ...s,
        plan: {
          ...s.plan,
          selectedRecipeIds: has
            ? s.plan.selectedRecipeIds.filter((x) => x !== id)
            : [...s.plan.selectedRecipeIds, id],
        },
      };
    });
  };

  const doShuffle = (n: 2 | 3): void => {
    mutate((s) => {
      const picks = shuffle(s.recipes, n);
      if (picks.length === 0) return s;
      return { ...s, plan: { ...s.plan, selectedRecipeIds: picks } };
    });
  };

  const toggleGroup = (id: string): void => {
    mutate((s) => ({
      ...s,
      stapleGroups: s.stapleGroups.map((g) =>
        g.id === id ? { ...g, enabled: !g.enabled } : g,
      ),
    }));
  };

  return (
    <div className="space-y-6 mt-2">
      <section
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: "var(--ink)", color: "var(--paper)" }}
      >
        <div className="relative z-10">
          <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">
            Tämän viikon valinnat
          </p>
          <p className="font-display text-5xl mt-1 leading-none">
            {selectedRecipes.length}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => doShuffle(2)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition active:scale-95"
              style={{ background: "var(--berry)", color: "var(--paper)" }}
            >
              <Dices size={16} />
              Arvo 2
            </button>
            <button
              onClick={() => doShuffle(3)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition active:scale-95"
              style={{ background: "var(--berry)", color: "var(--paper)" }}
            >
              <Dices size={16} />
              Arvo 3
            </button>
          </div>
        </div>
        <Sparkles
          size={120}
          className="absolute -right-6 -bottom-6 opacity-10"
          strokeWidth={1}
        />
      </section>

      {selectedRecipes.length > 0 && (
        <section>
          <SectionHead>Valitut</SectionHead>
          <div className="space-y-2 mt-2">
            {selectedRecipes.map((r) => (
              <SelectedCard
                key={r.id}
                recipe={r}
                onRemove={() => toggleRecipe(r.id)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <SectionHead>Vakiopaketit</SectionHead>
        <div className="space-y-2">
          {[...state.stapleGroups]
            .sort((a, b) => a.order - b.order)
            .map((g) => (
              <Toggle
                key={g.id}
                label={g.name}
                checked={g.enabled}
                onChange={() => toggleGroup(g.id)}
              />
            ))}
        </div>
      </section>

      <section>
        <SectionHead>Reseptit: Arki</SectionHead>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {common.map((r) => (
            <RecipeChip
              key={r.id}
              recipe={r}
              selected={state.plan.selectedRecipeIds.includes(r.id)}
              onClick={() => toggleRecipe(r.id)}
            />
          ))}
        </div>
        {special.length > 0 && (
          <>
            <SectionHead className="mt-5">Reseptit: Erikois</SectionHead>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {special.map((r) => (
                <RecipeChip
                  key={r.id}
                  recipe={r}
                  selected={state.plan.selectedRecipeIds.includes(r.id)}
                  onClick={() => toggleRecipe(r.id)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <button
        onClick={goList}
        className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-sm tracking-wide transition active:scale-[0.98]"
        style={{ background: "var(--ink)", color: "var(--paper)" }}
      >
        <ShoppingCart size={18} />
        Katso kauppalista
      </button>
    </div>
  );
}
