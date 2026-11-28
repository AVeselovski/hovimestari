import { tap } from "@/__tests__/helpers/tap";
import { openSheet, viewHoldPassed } from "@/__tests__/sheet";
import { createFood, getFood } from "@/lib/api/foods";
import { getSavedMeals } from "@/lib/api/savedMeals";
import type { FoodDetail } from "@hovimestari/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import messages from "../../../../messages/en.json";
import { answerWith, installLookups, lookups } from "./barcodeServer";
import { addOwn, body, dialog, field, installServer, renderSheet, server, type } from "./foodSheetServer";
import { detailOf, fineliFood, fineliPortion, listsInPlace, offFood, ownFood, ownPortion, refusal } from "./support";

// The log sheet carries the barcode of a scan that found nothing, from
// Search by name to the food the person saves as their own: Artur's olive
// oil, end to end, and what keeps the carry or ends it. The fake server
// answers what it holds (./barcodeServer.ts), and its `createFood` saves the
// portions a body brings, as the server does.

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn().mockResolvedValue({ items: [] }) }));
jest.mock("@/lib/api/recipes", () => ({ getRecipes: jest.fn().mockResolvedValue({ recipes: [] }) }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn(),
  createSavedMeal: jest.fn(),
  saveAndLog: jest.fn(),
  updateSavedMeal: jest.fn(),
  setSavedMealArchived: jest.fn(),
  deleteSavedMeal: jest.fn(),
}));
jest.mock("@/lib/api/foods", () => ({
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
  getFood: jest.fn(),
  createFood: jest.fn(),
  updateFood: jest.fn(),
  deleteFood: jest.fn(),
  addPortion: jest.fn(),
  updatePortion: jest.fn(),
  deletePortion: jest.fn(),
  setFavourite: jest.fn(),
  lookupBarcode: jest.fn(),
}));
jest.mock("@/components/foods/scanner/decoder", () => ({ loadDecoder: jest.fn() }));

// Each case walks a whole path through two sheets.
jest.setTimeout(15000);

const CODE = "6416710030208";
const OTHER = "6408430000258";
const line = (code: string) => messages.foods.sheet.carried.replace("<digits>{code}</digits>", code);

/** Fineli's olive oil, with its three measures. */
const oil: FoodDetail = detailOf(
  fineliFood("Oliiviöljy", { per100g: { energyKcal: 899.6, proteinG: 0, carbsG: 0, fatG: 99.875 } }),
  { portions: [fineliPortion("RKL", 13.5), fineliPortion("TL", 4.5), fineliPortion("DL", 91)] },
);

beforeEach(() => {
  installServer();
  installLookups();
  addOwn(oil);
  jest.mocked(getSavedMeals).mockReset().mockResolvedValue({ meals: [] });
});

const block = () => body().querySelector<HTMLElement>("[data-barcode-result]");
const carried = () => body().querySelector<HTMLElement>("[data-carried-line]");
const forget = () => within(carried()!).getByRole("button", { name: "Forget the barcode" });
const ownSheet = () => openSheet("New food");
const formField = (label: string) => within(ownSheet()!).getByLabelText(label) as HTMLInputElement;
const copyButton = () => within(dialog()).queryByRole("button", { name: /^Copy to my foods/ });
/** The copy button, once the food's detail is in. */
const copyFound = () => within(dialog()).findByRole("button", { name: /^Copy to my foods/ });
/** A list's rows as read, with the narrow space a figure's unit takes read as a space. */
const rowTexts = (list: HTMLElement) =>
  within(list)
    .getAllByRole("listitem")
    .map((li) => li.textContent!.replace(/\s/g, " "));

/** Waits out the half second the search holds presses after Search by name or Forget, as a person's next press would. */
const pressesTaken = () =>
  waitFor(() => expect(body().querySelector('[data-press-guard="waiting"]')).toBeNull(), { timeout: 2000 });

/** Types `code`, looks it up, waits for a miss, presses Search by name and waits until the search takes presses. */
async function missThenSearch(code: string, result = "not_found"): Promise<void> {
  type(code);
  fireEvent.click(within(block()!).getByRole("button", { name: "Look up" }));
  await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", result));
  fireEvent.click(within(block()!).getByRole("button", { name: "Search by name" }));
  await pressesTaken();
}

/** Searches `text` and opens the food named `name` from the results. */
async function openFood(text: string, name: string): Promise<void> {
  type(text);
  const row = await within(body()).findByRole("button", { name: new RegExp(`^${name}`) });
  await listsInPlace();
  tap(row);
  await within(dialog()).findByRole("button", { name: "Back" });
  await viewHoldPassed();
}

describe("the copy button's place in a food's view", () => {
  /** Whether `a` comes before `b` in the document. */
  const before = (a: Element, b: Element) =>
    (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) === Node.DOCUMENT_POSITION_FOLLOWING;

  /** The view's source row, the one copy button and the Per 100 g heading are in that order, the portions after. */
  async function expectCopyUnderTheSource(): Promise<void> {
    const copy = await copyFound();
    expect(within(dialog()).getAllByRole("button", { name: /^Copy to my foods/ })).toHaveLength(1);
    const source = dialog().querySelector("[data-food-source]")!;
    const per100g = within(dialog()).getByRole("heading", { name: /^Per 100\sg$/ });
    const portions = within(dialog()).getByRole("region", { name: "Portions" });
    expect(before(source, copy)).toBe(true);
    expect(before(copy, per100g)).toBe(true);
    expect(before(copy, portions)).toBe(true);
  }

  it("sits under the source line, before Per 100 g, with a barcode carried and without one", async () => {
    renderSheet();
    await openFood("oliivi", "Oliiviöljy");
    await expectCopyUnderTheSource();
    expect(await copyFound()).toHaveTextContent(/^Copy to my foods$/);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(within(dialog()).queryByRole("button", { name: "Back" })).toBeNull());

    await missThenSearch(CODE);
    await openFood("oliivi", "Oliiviöljy");
    await expectCopyUnderTheSource();
    expect(await copyFound()).toHaveTextContent(/^Copy to my foods with the barcode$/);
  });
});

describe("a copy button whose food's detail cannot be read", () => {
  it("does not show, and the portions say they are unavailable", async () => {
    jest.mocked(getFood).mockImplementation(() => Promise.reject(refusal(500, "internal")));
    renderSheet();
    await openFood("oliivi", "Oliiviöljy");
    await within(dialog()).findByText(messages.foods.detail.portionsUnavailable);
    expect(copyButton()).toBeNull();
  });
});

describe("the olive oil, in the log sheet", () => {
  it("carries the barcode from Search by name to the copy, which the next scan finds", async () => {
    renderSheet();
    await missThenSearch(CODE);
    // The line, in a status region of its own, above the lists.
    expect(carried()).toHaveTextContent(line(CODE));
    const region = within(carried()!).getByRole("status");
    expect(region).toHaveTextContent(line(CODE));
    expect(region).not.toContainElement(forget());

    await openFood("oliivi", "Oliiviöljy");
    fireEvent.change(within(dialog()).getByRole("textbox", { name: "Amount" }), { target: { value: "30" } });
    const copy = await copyFound();
    expect(copy).toHaveTextContent("Copy to my foods with the barcode");
    fireEvent.click(copy);

    const sheet = await waitFor(() => ownSheet()!);
    expect(formField("Name").value).toBe("Oliiviöljy");
    expect(formField("Barcode (optional)").value).toBe(CODE);
    expect(["Energy", "Protein", "Carbohydrates", "Fat"].map((l) => formField(l).value)).toEqual([
      "899.6",
      "0",
      "0",
      "99.875",
    ]);
    expect(sheet).toHaveTextContent(messages.foods.ownFood.checkFineli);
    // The portions, by the catalog's names, last in the form, after the barcode field.
    const list = within(sheet).getByRole("region", { name: "Portions" });
    // By name, as the saved food will list them.
    const listed = rowTexts(list);
    expect(listed).toEqual(["Decilitre91 g", "Tablespoon13.5 g", "Teaspoon4.5 g"]);
    expect(formField("Barcode (optional)").compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // Nothing offers the code again while the field holds it.
    expect(within(sheet).queryByRole("button", { name: /^Use barcode/ })).toBeNull();

    fireEvent.change(formField("Fat"), { target: { value: "92" } });
    fireEvent.change(formField("Name"), { target: { value: "Oliiviöljy Filos" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await waitFor(() =>
      expect(createFood).toHaveBeenCalledWith({
        name: "Oliiviöljy Filos",
        per100g: { energyKcal: 899.6, proteinG: 0, carbsG: 0, fatG: 92 },
        barcode: CODE,
        portions: [
          { name: "Decilitre", grams: 91 },
          { name: "Tablespoon", grams: 13.5 },
          { name: "Teaspoon", grams: 4.5 },
        ],
      }),
    );

    // The view is the copy's: the person's own food with the barcode, the grams typed kept.
    await waitFor(() => expect(ownSheet()).toBeNull());
    const source = await waitFor(() => {
      const row = dialog().querySelector<HTMLElement>("[data-food-source]")!;
      expect(row).toHaveTextContent(messages.foods.detail.sourceOwn);
      return row;
    });
    expect(source).toHaveTextContent(messages.foods.detail.ownBarcode.replace("<digits>{code}</digits>", CODE));
    // The code in mono as one span, as the carried line and the barcode block set it. The words and
    // the code share an inline parent: as two items of the flex row, the browser drops the space between.
    const mono = source.querySelector<HTMLElement>(".font-mono")!;
    expect(mono).toHaveTextContent(new RegExp(`^${CODE}$`));
    expect(mono.parentElement).not.toHaveAttribute("data-own-barcode");
    expect(mono.parentElement!.textContent).toBe(`Barcode ${CODE}`);
    expect(within(dialog()).getByRole("textbox", { name: "Amount" })).toHaveValue("30");
    expect(copyButton()).toBeNull();
    // The saved copy lists its portions in the order the form showed them: nothing reshuffles across Save.
    await waitFor(() => expect(rowTexts(within(dialog()).getByRole("region", { name: "Portions" }))).toEqual(listed));
    // Fineli's olive oil reads exactly as before.
    expect(server.foods[oil.id]).toEqual(oil);

    // Back: the barcode is on a food now, so nothing is carried.
    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(field()).toBeInTheDocument());
    expect(carried()).toBeNull();

    // The next lookup of the bottle opens the copy.
    type(CODE);
    fireEvent.click(within(block()!).getByRole("button", { name: "Look up" }));
    await waitFor(() => expect(dialog().querySelector("[data-food-source]")).toHaveTextContent(CODE));
    expect(within(dialog()).getByRole("heading", { level: 2 })).toHaveTextContent("Oliiviöljy Filos");
    expect(lookups.sent).toEqual([CODE, CODE]);
  });
});

describe("what the carried line names", () => {
  it("names the second code after two misses in a row, and goes while a barcode is typed", async () => {
    renderSheet();
    await missThenSearch(CODE);
    expect(carried()).toHaveTextContent(line(CODE));
    type(OTHER);
    expect(carried()).toBeNull();
    fireEvent.click(within(block()!).getByRole("button", { name: "Look up" }));
    await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", "not_found"));
    fireEvent.click(within(block()!).getByRole("button", { name: "Search by name" }));
    expect(carried()).toHaveTextContent(line(OTHER));
    expect(lookups.sent).toEqual([CODE, OTHER]);
  });

  it("stays through the clear cross", async () => {
    renderSheet();
    await missThenSearch(CODE);
    type("oliivi");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Clear the search" }));
    expect(field()).toHaveValue("");
    expect(carried()).toHaveTextContent(line(CODE));
  });

  it.each([
    ["a shop's own number", "20064020", { result: "in_store", barcode: "20064020" } as const, "in_store"],
    [
      "digits no barcode has",
      "6416710030209",
      { result: "wrong_digits", barcode: "6416710030209" } as const,
      "wrong_digits",
    ],
  ])("is not there after %s, and a new food opens with no barcode", async (_what, code, answer, result) => {
    answerWith(code, answer);
    renderSheet();
    await missThenSearch(code, result);
    expect(carried()).toBeNull();
    type("filos");
    fireEvent.click(await within(body()).findByRole("button", { name: "Add “filos” as your own food" }));
    await waitFor(() => expect(ownSheet()).not.toBeNull());
    expect(formField("Barcode (optional)").value).toBe("");
  });

  it("stays after an own food saved without the code, so the next copy still takes it", async () => {
    renderSheet();
    await missThenSearch(CODE);
    type("filos");
    fireEvent.click(await within(body()).findByRole("button", { name: "Add “filos” as your own food" }));
    await waitFor(() => expect(ownSheet()).not.toBeNull());
    expect(formField("Name").value).toBe("filos");
    expect(formField("Barcode (optional)").value).toBe(CODE);
    fireEvent.change(formField("Barcode (optional)"), { target: { value: "" } });
    for (const [label, value] of [
      ["Energy", "828"],
      ["Protein", "0"],
      ["Carbohydrates", "0"],
      ["Fat", "92"],
    ])
      fireEvent.change(formField(label), { target: { value } });
    fireEvent.click(within(ownSheet()!).getByRole("button", { name: "Save food" }));
    await waitFor(() => expect(createFood).toHaveBeenCalledWith(expect.objectContaining({ barcode: null })));
    // The new food's view opens. Back returns to the search, still carrying the code.
    await waitFor(() => expect(within(dialog()).getByRole("heading", { level: 2 })).toHaveTextContent("filos"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    await waitFor(() => expect(carried()).toHaveTextContent(line(CODE)));
    await openFood("oliivi", "Oliiviöljy");
    expect(await copyFound()).toHaveTextContent("Copy to my foods with the barcode");
  });
});

describe("Forget the barcode", () => {
  it("drops the line and puts focus in the field, and a copy then takes no barcode", async () => {
    renderSheet();
    await missThenSearch(CODE);
    // Focus on the button, as a press leaves it, so focus in the field is the press's doing.
    const press = forget();
    press.focus();
    fireEvent.click(press);
    expect(carried()).toBeNull();
    expect(document.activeElement).toBe(field());
    await pressesTaken();
    await openFood("oliivi", "Oliiviöljy");
    const copy = await copyFound();
    expect(copy).toHaveTextContent(/^Copy to my foods$/);
    fireEvent.click(copy);
    await waitFor(() => expect(ownSheet()).not.toBeNull());
    expect(formField("Barcode (optional)").value).toBe("");
  });

  it("leaves an Open Food Facts food's own barcode in its copy, where a carried code would take its place", async () => {
    const product = offFood("Filos ladolia", OTHER, { portions: [ownPortion("Korkillinen", 5)] });
    addOwn(product);
    renderSheet();
    await missThenSearch(CODE);
    await openFood("filos", "Filos ladolia");
    fireEvent.click(await copyFound());
    await waitFor(() => expect(ownSheet()).not.toBeNull());
    expect(formField("Barcode (optional)").value).toBe(CODE);
    expect(ownSheet()).toHaveTextContent(messages.foods.ownFood.checkProduct);
    fireEvent.click(within(ownSheet()!).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(ownSheet()).toBeNull());

    fireEvent.click(within(dialog()).getByRole("button", { name: "Back" }));
    fireEvent.click(await waitFor(() => forget()));
    await pressesTaken();
    await openFood("filos", "Filos ladolia");
    fireEvent.click(await copyFound());
    await waitFor(() => expect(ownSheet()).not.toBeNull());
    expect(formField("Barcode (optional)").value).toBe(OTHER);
    expect(rowTexts(within(ownSheet()!).getByRole("region", { name: "Portions" }))).toEqual(["Korkillinen5 g"]);
  });
});

describe("deletes keep the carry", () => {
  it("an own food deleted from its view", async () => {
    addOwn(detailOf(ownFood("Vanha öljy"), { portions: [] }));
    renderSheet();
    await missThenSearch(CODE);
    await openFood("vanha", "Vanha öljy");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Delete food" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Vanha öljy?" });
    await waitFor(() => expect(confirm.querySelector("[data-armed]")).not.toBeNull());
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(carried()).toHaveTextContent(line(CODE)));
    await openFood("oliivi", "Oliiviöljy");
    expect(await copyFound()).toHaveTextContent("Copy to my foods with the barcode");
  });

  it("a saved meal deleted from its view", async () => {
    const meal = {
      id: "00000000-0000-4000-8000-00000000aaaa",
      name: "Salaatti",
      source: null,
      figures: { energyKcal: 400, proteinG: 20, carbsG: 30, fatG: 15 },
      archived: false,
      lastCount: null,
    };
    jest.mocked(getSavedMeals).mockResolvedValue({ meals: [meal] });
    const { deleteSavedMeal } = jest.requireMock<{ deleteSavedMeal: jest.Mock }>("@/lib/api/savedMeals");
    deleteSavedMeal.mockResolvedValue(undefined);
    renderSheet();
    await missThenSearch(CODE);
    const row = await within(body()).findByRole("button", { name: /^Salaatti/ });
    await listsInPlace();
    tap(row);
    const remove = await within(dialog()).findByRole("button", { name: "Delete meal" });
    await viewHoldPassed();
    fireEvent.click(remove);
    const confirm = await screen.findByRole("dialog", { name: "Delete Salaatti?" });
    await waitFor(() => expect(confirm.querySelector("[data-armed]")).not.toBeNull());
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteSavedMeal).toHaveBeenCalledWith(meal.id));
    await waitFor(() => expect(carried()).toHaveTextContent(line(CODE)));
  });
});
