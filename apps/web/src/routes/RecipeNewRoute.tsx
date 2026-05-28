import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { State } from "@hovi/shared";
import { useStore } from "../lib/stateContext.js";
import {
  RecipeEditor,
  type RecipeEditorDraft,
} from "../components/RecipeEditor.js";
import { RecipeImportSheet } from "../components/RecipeImportSheet.js";
import { uid } from "../lib/uid.js";

type Phase =
  | { kind: "import" }
  | { kind: "editor"; initial: RecipeEditorDraft; warnings: string[] };

const BLANK: RecipeEditorDraft = {
  name: "",
  time: 20,
  servings: 4,
  category: "common",
  ingredients: [],
  instructions: [],
};

export function RecipeNewRoute(): JSX.Element | null {
  const { state, mutate } = useStore();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "import" });

  if (!state) return null;

  const onSave = (draft: RecipeEditorDraft): void => {
    const id = uid();
    mutate((s: State) => ({
      ...s,
      recipes: [...s.recipes, { ...draft, id } as State["recipes"][number]],
    }));
    navigate(`/recipes/${id}`);
  };

  if (phase.kind === "import") {
    return (
      <RecipeImportSheet
        onDraft={(draft, warnings) =>
          setPhase({
            kind: "editor",
            initial: { ...draft, instructions: draft.instructions ?? [] },
            warnings,
          })
        }
        onBlank={() =>
          setPhase({ kind: "editor", initial: BLANK, warnings: [] })
        }
        onCancel={() => navigate("/recipes")}
      />
    );
  }

  return (
    <RecipeEditor
      initial={phase.initial}
      warnings={phase.warnings}
      onSave={onSave}
      onCancel={() => navigate("/recipes")}
    />
  );
}
