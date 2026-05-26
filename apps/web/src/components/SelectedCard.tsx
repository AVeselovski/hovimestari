import { Clock, X } from "lucide-react";
import type { Recipe } from "@hovi/shared";

export function SelectedCard({
  recipe,
  onRemove,
}: {
  recipe: Recipe;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div
      className="rounded-xl p-3 flex items-center justify-between border"
      style={{ background: "var(--paper-2)", borderColor: "var(--rule)" }}
    >
      <div className="min-w-0">
        <p className="font-display text-lg leading-tight truncate">{recipe.name}</p>
        <p
          className="text-xs flex items-center gap-1 mt-0.5"
          style={{ color: "var(--muted)" }}
        >
          <Clock size={11} /> {recipe.time} min · {recipe.servings} ann
        </p>
      </div>
      <button
        onClick={onRemove}
        className="p-2 rounded-full"
        style={{ color: "var(--muted)" }}
        aria-label="Poista valinta"
      >
        <X size={16} />
      </button>
    </div>
  );
}
