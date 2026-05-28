import { ArrowLeft, Pencil } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import type { Recipe } from "@hovi/shared";
import { useStore } from "../lib/stateContext.js";
import { SectionHead } from "../components/SectionHead.js";
import { NotFound } from "./NotFound.js";

export function RecipeDetail(): JSX.Element | null {
  const { state } = useStore();
  const { id } = useParams();
  const navigate = useNavigate();
  if (!state) return null;
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return <NotFound />;
  return (
    <RecipeDetailView
      recipe={recipe}
      onBack={() => navigate("/recipes")}
      onEdit={() => navigate(`/recipes/${recipe.id}/edit`)}
    />
  );
}

export function RecipeDetailView({
  recipe,
  onBack,
  onEdit,
}: {
  recipe: Recipe;
  onBack: () => void;
  onEdit: () => void;
}): JSX.Element {
  const instructions = recipe.instructions ?? [];

  return (
    <div className="space-y-5 mt-2">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm"
          style={{ color: "var(--ink)" }}
        >
          <ArrowLeft size={16} /> Takaisin
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          <Pencil size={13} /> Muokkaa
        </button>
      </div>

      <div>
        <h2 className="font-display text-3xl leading-tight">{recipe.name}</h2>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Chip>{recipe.time} min</Chip>
          <Chip>{recipe.servings} ann.</Chip>
          <Chip>{recipe.category === "common" ? "Arki" : "Erikois"}</Chip>
          {recipe.keepsOvernight && <Chip accent>Yön yli ok</Chip>}
        </div>
      </div>

      <section className="space-y-2">
        <SectionHead>Ainekset</SectionHead>
        <ul
          className="rounded-xl border divide-y"
          style={{
            borderColor: "var(--rule)",
            background: "var(--paper-2)",
          }}
        >
          {recipe.ingredients.map((ing, i) => (
            <li
              key={i}
              className="px-3 py-2 flex items-baseline justify-between gap-3"
              style={{ borderColor: "var(--rule)" }}
            >
              <span className="text-sm leading-tight">{ing.name}</span>
              <span
                className="text-xs tabular-nums shrink-0"
                style={{ color: "var(--muted)" }}
              >
                {ing.amount}
                {ing.unit ? ` ${ing.unit}` : ""}
              </span>
            </li>
          ))}
          {recipe.ingredients.length === 0 && (
            <li
              className="px-3 py-3 text-xs"
              style={{ color: "var(--muted)" }}
            >
              Ei aineksia.
            </li>
          )}
        </ul>
      </section>

      <section className="space-y-2">
        <SectionHead>Ohjeet</SectionHead>
        {instructions.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Ei ohjeita vielä — lisää itse.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {instructions.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="font-display text-lg leading-none shrink-0 w-6 text-right"
                  style={{ color: "var(--berry)" }}
                >
                  {i + 1}.
                </span>
                <span className="text-sm leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Chip({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: boolean;
}): JSX.Element {
  return (
    <span
      className="text-[11px] tracking-wide px-2 py-1 rounded-full border"
      style={{
        borderColor: accent ? "var(--berry)" : "var(--rule)",
        color: accent ? "var(--berry)" : "var(--ink)",
        background: "var(--paper-2)",
      }}
    >
      {children}
    </span>
  );
}
