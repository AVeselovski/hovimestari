import { Edit2, Plus, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import type { Recipe } from "@hovi/shared";
import { SectionHead } from "../components/SectionHead.js";

export function RecipesTab({
  recipes,
  onOpen,
  onEdit,
  onDelete,
  onNew,
}: {
  recipes: Recipe[];
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}): JSX.Element {
  const common = recipes.filter((r) => r.category === "common");
  const special = recipes.filter((r) => r.category === "special");

  return (
    <div className="space-y-5 mt-2">
      <div className="flex items-center justify-between">
        <SectionHead>Kaikki reseptit · {recipes.length}</SectionHead>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          <Plus size={14} /> Uusi
        </button>
      </div>

      <RecipeGroup
        title="Arki"
        recipes={common}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={onDelete}
      />
      <RecipeGroup
        title="Erikois"
        recipes={special}
        onOpen={onOpen}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

function RecipeGroup({
  title,
  recipes,
  onOpen,
  onEdit,
  onDelete,
}: {
  title: string;
  recipes: Recipe[];
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  const stop = (e: MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <section className="space-y-2">
      <SectionHead>{title}</SectionHead>
      {recipes.length === 0 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Ei reseptejä.
        </p>
      )}
      {recipes.map((r) => (
        <div
          key={r.id}
          onClick={() => onOpen(r.id)}
          className="rounded-xl p-4 border cursor-pointer"
          style={{ background: "var(--paper-2)", borderColor: "var(--rule)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg leading-tight">{r.name}</p>
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {r.time} min · {r.servings} annosta · {r.ingredients.length} ainesta
                {r.keepsOvernight && (
                  <>
                    {" · "}
                    <span style={{ color: "var(--berry)" }}>kestää yön yli</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                onClick={(e) => {
                  stop(e);
                  onEdit(r.id);
                }}
                className="p-2 rounded-lg"
                style={{ color: "var(--muted)" }}
                aria-label="Muokkaa reseptiä"
              >
                <Edit2 size={15} />
              </button>
              <button
                onClick={(e) => {
                  stop(e);
                  onDelete(r.id);
                }}
                className="p-2 rounded-lg"
                style={{ color: "var(--muted)" }}
                aria-label="Poista resepti"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
