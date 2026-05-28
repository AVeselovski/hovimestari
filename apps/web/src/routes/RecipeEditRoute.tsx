import { useNavigate, useParams } from "react-router-dom";
import type { State } from "@hovi/shared";
import { useStore } from "../lib/stateContext.js";
import {
  RecipeEditor,
  type RecipeDraft,
} from "../components/RecipeEditor.js";
import { NotFound } from "./NotFound.js";

export function RecipeEditRoute(): JSX.Element | null {
  const { state, mutate } = useStore();
  const { id } = useParams();
  const navigate = useNavigate();
  if (!state) return null;
  const recipe = state.recipes.find((r) => r.id === id);
  if (!recipe) return <NotFound />;

  const initial: RecipeDraft = {
    ...recipe,
    instructions: recipe.instructions ?? [],
  };

  const onSave = (draft: RecipeDraft): void => {
    mutate((s: State) => ({
      ...s,
      recipes: s.recipes.map((r) =>
        r.id === recipe.id
          ? ({ ...r, ...draft, id: recipe.id } as State["recipes"][number])
          : r,
      ),
    }));
    navigate(`/recipes/${recipe.id}`);
  };

  return (
    <RecipeEditor
      initial={initial}
      onSave={onSave}
      onCancel={() => navigate(`/recipes/${recipe.id}`)}
    />
  );
}
