import { Check, Clock } from "lucide-react";
import type { Recipe } from "@hovi/shared";

export function RecipeChip({
  recipe,
  selected,
  onClick,
}: {
  recipe: Recipe;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="text-left p-3 rounded-xl border transition relative"
      style={{
        background: selected ? "var(--ink)" : "var(--paper-2)",
        color: selected ? "var(--paper)" : "var(--ink)",
        borderColor: selected ? "var(--ink)" : "var(--rule)",
      }}
    >
      <p className="font-display text-[15px] leading-tight">{recipe.name}</p>
      <p className="text-[11px] mt-1 opacity-70 flex items-center gap-1">
        <Clock size={10} /> {recipe.time} min
      </p>
      {selected && <Check size={14} className="absolute top-2 right-2" />}
    </button>
  );
}
