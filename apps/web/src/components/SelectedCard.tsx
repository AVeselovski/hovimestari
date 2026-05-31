import { Clock, X } from "lucide-react";
import type { PlanRecipe, Recipe } from "@hovi/shared";
import { ServingsChip } from "./ServingsChip.js";

export function SelectedCard({
  recipe,
  planRecipe,
  onRemove,
  onServingsChange,
}: {
  recipe: Recipe;
  planRecipe: PlanRecipe;
  onRemove: () => void;
  onServingsChange: (next: number) => void;
}): JSX.Element {
  return (
    <div
      className="rounded-xl p-3 border"
      style={{ background: "var(--paper-2)", borderColor: "var(--rule)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight truncate">{recipe.name}</p>
          <p
            className="text-xs flex items-center gap-1 mt-0.5"
            style={{ color: "var(--muted)" }}
          >
            <Clock size={11} /> {recipe.time} min
          </p>
        </div>
        <button
          onClick={onRemove}
          className="p-2 rounded-full -mr-1 -mt-1"
          style={{ color: "var(--muted)" }}
          aria-label="Poista valinta"
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-2">
        <ServingsChip
          base={recipe.servings}
          value={planRecipe.servings}
          onChange={onServingsChange}
        />
      </div>
    </div>
  );
}
