import { useNavigate } from "react-router-dom";
import { useStore } from "../lib/stateContext.js";
import { RecipesTab } from "../tabs/RecipesTab.js";

export function RecipesRoute(): JSX.Element | null {
  const { state, mutate } = useStore();
  const navigate = useNavigate();
  if (!state) return null;

  const onDelete = (id: string): void => {
    if (!window.confirm("Poista resepti?")) return;
    mutate((s) => ({
      ...s,
      recipes: s.recipes.filter((r) => r.id !== id),
      plan: {
        ...s.plan,
        selectedRecipeIds: s.plan.selectedRecipeIds.filter((x) => x !== id),
      },
    }));
  };

  return (
    <RecipesTab
      recipes={state.recipes}
      onOpen={(id) => navigate(`/recipes/${id}`)}
      onEdit={(id) => navigate(`/recipes/${id}/edit`)}
      onDelete={onDelete}
      onNew={() => navigate("/recipes/new")}
    />
  );
}
