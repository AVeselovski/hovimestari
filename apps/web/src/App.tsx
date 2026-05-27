import { useEffect, useState } from "react";
import {
  Calendar,
  ChefHat,
  Coffee,
  Package,
  ShoppingCart,
} from "lucide-react";
import type { State } from "@hovi/shared";
import { TabBtn } from "./components/TabBtn.js";
import {
  RecipeEditor,
  type RecipeDraft,
} from "./components/RecipeEditor.js";
import { RecipeImportSheet } from "./components/RecipeImportSheet.js";
import { PlanTab } from "./tabs/PlanTab.js";
import { RecipesTab } from "./tabs/RecipesTab.js";
import { StaplesTab } from "./tabs/StaplesTab.js";
import { ListTab } from "./tabs/ListTab.js";
import { buildShoppingList } from "./lib/shoppingList.js";
import { useStateStore } from "./lib/useStateStore.js";
import { uid } from "./lib/uid.js";

type Tab = "plan" | "recipes" | "staples" | "list";

export function App(): JSX.Element {
  const { state, status, mutate, dismissConflict } = useStateStore();
  const [tab, setTab] = useState<Tab>("plan");
  const [editingRecipe, setEditingRecipe] = useState<RecipeDraft | null>(null);
  const [editorWarnings, setEditorWarnings] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggleChecked = (key: string): void =>
    setChecked((c) => ({ ...c, [key]: !c[key] }));
  const clearChecked = (): void => setChecked({});

  useEffect(() => {
    if (status !== "conflict") return;
    const id = setTimeout(dismissConflict, 5000);
    return () => clearTimeout(id);
  }, [status, dismissConflict]);

  const totalItems = state
    ? buildShoppingList(state).reduce((s, g) => s + g.items.length, 0)
    : 0;

  const onDeleteRecipe = (id: string): void => {
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

  const onSaveRecipe = (draft: RecipeDraft): void => {
    mutate((s: State) => {
      if (draft.id && s.recipes.find((r) => r.id === draft.id)) {
        return {
          ...s,
          recipes: s.recipes.map((r) =>
            r.id === draft.id ? ({ ...r, ...draft, id: draft.id } as State["recipes"][number]) : r,
          ),
        };
      }
      const newRecipe = { ...draft, id: uid() } as State["recipes"][number];
      return { ...s, recipes: [...s.recipes, newRecipe] };
    });
    setEditingRecipe(null);
    setEditorWarnings([]);
  };

  const openBlankEditor = (): void => {
    setEditorWarnings([]);
    setEditingRecipe({
      name: "",
      time: 20,
      servings: 4,
      category: "common",
      ingredients: [],
    });
  };

  return (
    <div className="min-h-screen w-full font-body bg-paper text-ink">
      <div className="fixed top-0 inset-x-0 z-40 flex flex-col">
        {status === "conflict" && (
          <div
            className="px-5 py-2 text-center text-xs"
            style={{ background: "var(--berry)", color: "var(--paper)" }}
          >
            Tila päivitetty palvelimelta.
          </div>
        )}
        {state !== null && status === "saving" && (
          <div
            className="px-5 py-2 text-center text-xs"
            style={{ background: "var(--muted)", color: "var(--paper)" }}
          >
            Tallennetaan…
          </div>
        )}
        {state !== null && status === "error" && (
          <div
            className="px-5 py-2 text-center text-xs"
            style={{ background: "var(--berry)", color: "var(--paper)" }}
          >
            Tallennus epäonnistui — yritetään uudelleen.
          </div>
        )}
      </div>

      <header className="px-5 pt-7 pb-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h1
              className="font-display text-3xl leading-none tracking-tight"
              style={{ color: "var(--ink)" }}
            >
              Kauppalista<span style={{ color: "var(--berry)" }}>.</span>
            </h1>
            <p
              className="text-xs tracking-widest uppercase mt-1.5"
              style={{ color: "var(--muted)", letterSpacing: "0.15em" }}
            >
              Torstain toimitus · S-Kaupat
            </p>
          </div>
          <Coffee size={22} style={{ color: "var(--ink)" }} strokeWidth={1.5} />
        </div>
        <div
          className="mt-4 h-px"
          style={{
            background:
              "repeating-linear-gradient(to right, var(--rule) 0 4px, transparent 4px 8px)",
          }}
        />
      </header>

      <main className="px-5 pb-32">
        {state === null ? (
          <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
            {status === "error" ? "Virhe ladattaessa tilaa." : "Ladataan…"}
          </p>
        ) : (
          <>
            {tab === "plan" && (
              <PlanTab state={state} mutate={mutate} goList={() => setTab("list")} />
            )}
            {tab === "recipes" && (
              <RecipesTab
                recipes={state.recipes}
                onEdit={(r) => {
                  setEditorWarnings([]);
                  setEditingRecipe(r);
                }}
                onDelete={onDeleteRecipe}
                onNew={() => setImporting(true)}
              />
            )}
            {tab === "staples" && <StaplesTab state={state} mutate={mutate} />}
            {tab === "list" && (
              <ListTab
                state={state}
                mutate={mutate}
                checked={checked}
                toggleChecked={toggleChecked}
                clearChecked={clearChecked}
                goPlan={() => setTab("plan")}
              />
            )}
          </>
        )}
      </main>

      {importing && (
        <RecipeImportSheet
          onDraft={(draft, warnings) => {
            setImporting(false);
            setEditorWarnings(warnings);
            setEditingRecipe({ ...draft });
          }}
          onBlank={() => {
            setImporting(false);
            openBlankEditor();
          }}
          onCancel={() => setImporting(false)}
        />
      )}

      {editingRecipe && (
        <RecipeEditor
          initial={editingRecipe}
          warnings={editorWarnings}
          onSave={onSaveRecipe}
          onCancel={() => {
            setEditingRecipe(null);
            setEditorWarnings([]);
          }}
        />
      )}

      <nav
        className="fixed bottom-0 inset-x-0 border-t"
        style={{ background: "var(--paper)", borderColor: "var(--rule)" }}
      >
        <div className="grid grid-cols-4">
          <TabBtn
            icon={Calendar}
            label="Suunnitelma"
            active={tab === "plan"}
            onClick={() => setTab("plan")}
          />
          <TabBtn
            icon={ChefHat}
            label="Reseptit"
            active={tab === "recipes"}
            onClick={() => setTab("recipes")}
          />
          <TabBtn
            icon={Package}
            label="Vakiot"
            active={tab === "staples"}
            onClick={() => setTab("staples")}
          />
          <TabBtn
            icon={ShoppingCart}
            label="Lista"
            badge={totalItems}
            active={tab === "list"}
            onClick={() => setTab("list")}
          />
        </div>
      </nav>
    </div>
  );
}
