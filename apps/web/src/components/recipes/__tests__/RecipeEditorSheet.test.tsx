import { describeFormSheetContract } from "@/__tests__/formSheet";
import { deferred } from "@/__tests__/helpers/queryClient";
import { detailOf, fineliFood, fineliPortion } from "@/components/foods/__tests__/support";
import { getFavouriteFoods, getFood, getOwnFoods, searchFoods } from "@/lib/api/foods";
import { createRecipe, updateRecipe } from "@/lib/api/recipes";
import { queryKeys } from "@/lib/queryKeys";
import { recipeSummaryOf } from "@/lib/recipeCache";
import type { FoodDetail, Recipe, RecipeList } from "@hovimestari/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RecipeEditorSheet, type RecipeEditorSheetProps } from "../RecipeEditorSheet";
import { recipeOf, shakshuka } from "./recipeFixtures";
import { FakeRecipes, refusedAt, serveRecipes } from "./recipeServer";

// The recipe editor on its own, against the fake recipe server and a small
// food search: the form sheet contract, the live figures against the
// server's, lines from the picker, the method, tags, a copy, and where each
// refusal lands.

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/recipes" }));
jest.mock("@/lib/api/foods", () => ({
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
  getFood: jest.fn(),
  createFood: jest.fn(),
  updateFood: jest.fn(),
  deleteFood: jest.fn(),
  setFavourite: jest.fn(),
  lookupBarcode: jest.fn(),
}));
jest.mock("@/lib/api/recipes", () => ({
  getRecipes: jest.fn(),
  getRecipe: jest.fn(),
  createRecipe: jest.fn(),
  updateRecipe: jest.fn(),
  setRecipeArchived: jest.fn(),
  setRecipeFavourite: jest.fn(),
  deleteRecipe: jest.fn(),
}));

jest.setTimeout(20_000);

// Real Fineli values per 100 g, so the editor and the server compute over the figures a person sees.
const egg = fineliFood("Kananmuna, kuoreton", {
  per100g: { energyKcal: 134.17, proteinG: 12.61, carbsG: 0.4, fatG: 9.24 },
});
const eggPiece = fineliPortion("KPL_M", 55);
const tomato = fineliFood("Tomaattimurska", { per100g: { energyKcal: 30.36, proteinG: 0.56, carbsG: 5.1, fatG: 0.3 } });
const details: Record<string, FoodDetail> = {
  [egg.id]: detailOf(egg, { portions: [eggPiece] }),
  [tomato.id]: detailOf(tomato),
};

let server: FakeRecipes;
beforeEach(() => {
  jest.mocked(searchFoods).mockImplementation(async (q) => ({
    foods: [egg, tomato].filter((f) => f.name.toLowerCase().includes(q.toLowerCase().split(" ")[0])),
  }));
  jest.mocked(getFavouriteFoods).mockResolvedValue({ foods: [] });
  jest.mocked(getOwnFoods).mockResolvedValue({ foods: [] });
  jest.mocked(getFood).mockImplementation(async (id) => details[id]);
  server = serveRecipes(new FakeRecipes([], [egg, tomato]));
  server.portions.set(eggPiece.id, { foodId: egg.id, grams: 55, unit: "KPL_M" });
});

function client(recipes: Recipe[] = []): QueryClient {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  c.setQueryData<RecipeList>(queryKeys.recipeList(false), { recipes: recipes.map(recipeSummaryOf) });
  return c;
}

function renderEditor(props: Partial<RecipeEditorSheetProps> = {}, c: QueryClient = client()) {
  const handlers = { onClose: jest.fn(), onSaved: jest.fn(), onSavedRecipe: jest.fn() };
  render(
    <QueryClientProvider client={c}>
      <RecipeEditorSheet open returnFocusTo={null} {...handlers} {...props} />
    </QueryClientProvider>,
  );
  return handlers;
}

/** The editor's dialog, read from the DOM, so it is found under the picker too. */
const editor = () => document.querySelector("[data-editor-ingredients]")!.closest<HTMLElement>('[role="dialog"]')!;
const picker = () => screen.getByRole("dialog", { name: "Add ingredient" });
const input = (label: string) =>
  within(editor()).getByLabelText(label, { selector: "input,textarea" }) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
const settle = () => act(() => new Promise((r) => setTimeout(r, 400)));
const figureCells = () =>
  [...editor().querySelectorAll("[data-recipe-figures] tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent),
  );
/** Each line's text, its spaces as typed: a figure's unit sits after a no-break space. */
const rows = () =>
  [...editor().querySelectorAll("[data-ingredient-rows] li")].map((li) => li.textContent!.replace(/\u00a0/g, " "));

/** Adds a food through the picker: search, tap, the amount, Add. The picker stays open. */
async function addFromPicker(query: string, name: RegExp, amount: string, chip?: RegExp): Promise<void> {
  fireEvent.change(within(picker()).getByLabelText("Search foods"), { target: { value: query } });
  await settle();
  fireEvent.click(await within(picker()).findByRole("button", { name }));
  if (chip) fireEvent.click(await within(picker()).findByRole("radio", { name: chip }));
  fireEvent.change(within(picker()).getByRole("textbox", { name: "Amount" }), { target: { value: amount } });
  fireEvent.click(within(picker()).getByRole("button", { name: "Add" }));
  await act(async () => {});
}

describe("RecipeEditorSheet", () => {
  describeFormSheetContract({
    endsInLine: true,
    name: /^edit recipe$/i,
    panelClass: "md:max-w-xl",
    renderSheet: (p) => (
      <QueryClientProvider client={client()}>
        <RecipeEditorSheet {...p} recipe={shakshuka()} />
      </QueryClientProvider>
    ),
    type: () => type("Name", "Shakshuka, spicy"),
    typedField: () => input("Name"),
    fillValid: () => type("Name", "Shakshuka, spicy"),
    holdSave: () => {
      const held = deferred<Recipe>();
      jest.mocked(updateRecipe).mockReturnValue(held.promise);
      return { resolve: () => held.resolve(shakshuka()), reject: () => held.reject(refusedAt(500, "internal")) };
    },
    firstField: () => input("Name"),
    saveName: /^save recipe$/i,
  });

  it("makes a recipe from foods: lines from the picker appear behind it, figures as typed equal the server's", async () => {
    const h = renderEditor();
    expect(editor()).toHaveAccessibleName("New recipe");
    type("Name", "Shakshuka");
    expect(within(editor()).getByText("Add at least one ingredient.")).toBeInTheDocument();
    fireEvent.click(within(editor()).getByRole("button", { name: "Add ingredient" }));
    await screen.findByRole("dialog", { name: "Add ingredient" });
    await addFromPicker("kananmuna", /^Kananmuna, kuoreton/, "4", /^Medium piece/);
    // Behind the open picker, the line is already in the editor.
    expect(rows()).toEqual(["Kananmuna, kuoreton4 × Medium piece · 220 g"]);
    await addFromPicker("tomaatti", /^Tomaattimurska/, "400");
    fireEvent.click(within(picker()).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add ingredient" })).toBeNull());
    expect(rows()).toEqual(["Kananmuna, kuoreton4 × Medium piece · 220 g", "Tomaattimurska400 g"]);
    const typed = figureCells();
    fireEvent.click(within(editor()).getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(h.onClose).toHaveBeenCalled());
    const saved: Recipe = h.onSavedRecipe.mock.calls[0][0];
    const fromServer = recipeOf("x", 2, saved.lines);
    expect(typed).toEqual([
      [`${Math.round(fromServer.perServing.energyKcal)} kcal`, `${Math.round(fromServer.whole.energyKcal)} kcal`],
      [`${fromServer.perServing.proteinG.toFixed(1)} g`, `${fromServer.whole.proteinG.toFixed(1)} g`],
      [`${fromServer.perServing.carbsG.toFixed(1)} g`, `${fromServer.whole.carbsG.toFixed(1)} g`],
      [`${fromServer.perServing.fatG.toFixed(1)} g`, `${fromServer.whole.fatG.toFixed(1)} g`],
    ]);
    expect(saved.perServing).toEqual(fromServer.perServing);
    // A count of a portion goes as the count, and the server works out the grams.
    expect(server.created[0].lines[0]).toMatchObject({
      counted: true,
      foodId: egg.id,
      amount: { portionId: eggPiece.id, count: 4 },
    });
  });

  it("sends the method as its non-empty lines, and every field on every save", async () => {
    const shak = shakshuka({ tags: ["Brunch"], notes: "Hot.", timeMinutes: 25, steps: ["One."] });
    server.add(shak);
    const h = renderEditor({ recipe: shak });
    type("Method", "  Soften the onion.  \n\n Crack in the eggs.\n");
    fireEvent.click(within(editor()).getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(h.onClose).toHaveBeenCalled());
    expect(server.updated[0].body).toEqual({
      name: "Shakshuka",
      servings: 2,
      timeMinutes: 25,
      lines: expect.any(Array),
      steps: ["Soften the onion.", "Crack in the eggs."],
      notes: "Hot.",
      tags: ["Brunch"],
    });
    expect(server.updated[0].body.lines.map((l) => l.id)).toEqual(shak.lines.map((l) => l.id));
  });

  it("takes tags typed with Enter or a comma, once each, and the person's other tags tapped", async () => {
    const other = recipeOf("Puuro", 1, [{ name: "Water" }], { tags: ["Breakfast", "Quick"] });
    renderEditor({}, client([other]));
    const tags = input("Tags");
    fireEvent.change(tags, { target: { value: "Brunch" } });
    fireEvent.keyDown(tags, { key: "Enter" });
    fireEvent.change(tags, { target: { value: "Weekend,brunch," } });
    const group = within(editor()).getByRole("group", { name: "Your other tags" });
    fireEvent.click(within(group).getByRole("button", { name: "Quick" }));
    const chosen = within(editor()).getByRole("list", { name: "Tags" });
    expect(
      within(chosen)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Brunch", "Weekend", "Quick"]);
    expect(within(group).queryByRole("button", { name: "Quick" })).toBeNull();
    fireEvent.click(within(chosen).getByRole("button", { name: "Remove tag Weekend" }));
    expect(
      within(chosen)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Brunch", "Quick"]);
  });

  it("opens a copy as a new recipe with new ids, its name the same", async () => {
    const shak = server.add(shakshuka());
    const h = renderEditor({ recipe: shak, copy: true });
    expect(editor()).toHaveAccessibleName("New recipe");
    expect(input("Name").value).toBe("Shakshuka");
    fireEvent.click(within(editor()).getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(h.onClose).toHaveBeenCalled());
    const body = server.created[0];
    expect(body.id).not.toBe(shak.id);
    expect(body.lines.map((l) => l.id).some((id) => shak.lines.some((l) => l.id === id))).toBe(false);
    expect(h.onSavedRecipe).toHaveBeenCalledWith(expect.objectContaining({ id: body.id }), true);
  });

  it("puts a refusal under its field, and a refusal that names a line under that ingredient", async () => {
    const shak = shakshuka();
    server.add(shak);
    renderEditor({ recipe: shak });
    jest.mocked(updateRecipe).mockRejectedValueOnce(refusedAt(400, "recipe_serving_too_large"));
    fireEvent.click(within(editor()).getByRole("button", { name: "Save recipe" }));
    expect(
      await within(editor()).findByText(
        "One serving comes to more than 10000 kcal or 1000 g of protein, carbs or fat. Check the amounts.",
      ),
    ).toBeInTheDocument();
    jest.mocked(updateRecipe).mockRejectedValueOnce(refusedAt(404, "food_not_found", 2));
    fireEvent.click(within(editor()).getByRole("button", { name: "Save recipe" }));
    const feta = await waitFor(() => {
      const row = editor().querySelectorAll("[data-ingredient-rows] li")[2];
      expect(row.querySelector("p")).not.toBeNull();
      return row;
    });
    expect(feta.querySelector("button")).toHaveAttribute("aria-invalid", "true");
    expect(feta.querySelector("button")).toHaveTextContent(/^Feta/);
    expect(feta.querySelector("p")!.textContent).toBe("This food is no longer available.");
    // The other lines carry no refusal.
    expect(editor().querySelectorAll("[data-ingredient-rows] li p")).toHaveLength(1);
  });

  it("refuses an empty name and no ingredients before sending anything", async () => {
    renderEditor();
    fireEvent.click(within(editor()).getByRole("button", { name: "Save recipe" }));
    expect(await within(editor()).findByText("Give it a name.")).toBeInTheDocument();
    type("Name", "Soup");
    fireEvent.click(within(editor()).getByRole("button", { name: "Save recipe" }));
    await waitFor(() =>
      expect(editor().querySelector("[data-editor-ingredients] p[class*='text-accent']")?.textContent).toBe(
        "Add at least one ingredient.",
      ),
    );
    expect(createRecipe).not.toHaveBeenCalled();
  });

  it("turns a line whose portion was removed into grams, so the next save passes", async () => {
    const shak = recipeOf("Munakas", 1, [
      {
        food: { id: egg.id, name: egg.name, per100g: egg.per100g },
        grams: 110,
        portion: { id: eggPiece.id, unit: "KPL_M", name: null, count: 2 },
      },
    ]);
    server.add(shak);
    const h = renderEditor({ recipe: shak });
    // The portion went away on another device.
    server.portions.clear();
    fireEvent.click(within(editor()).getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(rows()[0]).toContain("This portion is no longer available."));
    expect(rows()[0]).toMatch(/^Kananmuna, kuoreton110\sg/);
    fireEvent.click(within(editor()).getByRole("button", { name: "Save recipe" }));
    await waitFor(() => expect(h.onClose).toHaveBeenCalled());
    expect(server.updated[1].body.lines[0]).toMatchObject({ amount: { grams: 110 } });
  });
});
