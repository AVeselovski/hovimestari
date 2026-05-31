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
  const selectedPairs = state.plan.selectedRecipes
    .map((pr) => {
      const r = state.recipes.find((rr) => rr.id === pr.recipeId);
      return r ? { recipe: r, planRecipe: pr } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const selectedIds = new Set(state.plan.selectedRecipes.map((pr) => pr.recipeId));
  const common = state.recipes.filter((r) => r.category === "common");
  const special = state.recipes.filter((r) => r.category === "special");

  const toggleRecipe = (id: string): void => {
    mutate((s) => {
      const has = s.plan.selectedRecipes.some((pr) => pr.recipeId === id);
      if (has) {
        return {
          ...s,
          plan: {
            ...s.plan,
            selectedRecipes: s.plan.selectedRecipes.filter(
              (pr) => pr.recipeId !== id,
            ),
          },
        };
      }
      const r = s.recipes.find((rr) => rr.id === id);
      if (!r) return s;
      return {
        ...s,
        plan: {
          ...s.plan,
          selectedRecipes: [
            ...s.plan.selectedRecipes,
            { recipeId: id, servings: r.servings },
          ],
        },
      };
    });
  };

  const setServings = (recipeId: string, n: number): void => {
    mutate((s) => ({
      ...s,
      plan: {
        ...s.plan,
        selectedRecipes: s.plan.selectedRecipes.map((pr) =>
          pr.recipeId === recipeId ? { ...pr, servings: n } : pr,
        ),
      },
    }));
  };

  const doShuffle = (n: 2 | 3): void => {
    mutate((s) => {
      const picks = shuffle(s.recipes, n);
      if (picks.length === 0) return s;
      const selectedRecipes = picks
        .map((id) => {
          const r = s.recipes.find((rr) => rr.id === id);
          return r ? { recipeId: id, servings: r.servings } : null;
        })
        .filter((x): x is { recipeId: string; servings: number } => x !== null);
      return { ...s, plan: { ...s.plan, selectedRecipes } };
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
            {selectedPairs.length}
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

      {selectedPairs.length > 0 && (
        <section>
          <SectionHead>Valitut</SectionHead>
          <div className="space-y-2 mt-2">
            {selectedPairs.map(({ recipe, planRecipe }) => (
              <SelectedCard
                key={recipe.id}
                recipe={recipe}
                planRecipe={planRecipe}
                onRemove={() => toggleRecipe(recipe.id)}
                onServingsChange={(n) => setServings(recipe.id, n)}
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
              selected={selectedIds.has(r.id)}
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
                  selected={selectedIds.has(r.id)}
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
