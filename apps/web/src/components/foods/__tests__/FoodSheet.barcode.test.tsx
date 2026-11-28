import { lookupBarcode, searchFoods } from "@/lib/api/foods";
import { getSavedMeals } from "@/lib/api/savedMeals";
import type { BarcodeLookup, SavedMeal } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AxiosError } from "axios";
import { answerWith, failWith, installLookups, lookups, releaseLookups } from "./barcodeServer";
import { body, dialog, field, installServer, renderSheet, settle, type } from "./foodSheetServer";
import { installCameraApiOnly } from "./scannerFakes";
import { refusal } from "./support";

// The log sheet's barcode mode: what puts the search view in it and takes it
// out, what is sent and when, every state of the result block with its copy
// and its actions, and what holds still from one state to the next.

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

const CODE = "6408430000258";
// A saved meal whose name holds digits, so a filter on the device would match the code if it ran.
const meal: SavedMeal = {
  id: "00000000-0000-4000-8000-0000000000aa",
  name: "Lounas 6408430000258",
  source: null,
  figures: { energyKcal: 500, proteinG: 30, carbsG: 50, fatG: 15 },
  archived: false,
  lastCount: null,
};

beforeEach(() => {
  installServer();
  installLookups();
  jest
    .mocked(getSavedMeals)
    .mockReset()
    .mockResolvedValue({ meals: [meal] });
});

const block = () => body().querySelector<HTMLElement>("[data-barcode-result]");
const lookUp = () => fireEvent.click(within(block()!).getByRole("button", { name: /^Look up|^Looking up/ }));
const buttonsIn = (el: HTMLElement) =>
  within(el)
    .queryAllByRole("button")
    .map((b) => b.textContent);
/**
 * Enter in the field. Enter also blurs the field to put the keyboard away,
 * and jsdom's blur hands Base UI's focus guard a related target that is no
 * element, which a browser never does. Focus sits on the block first, so the
 * blur has nothing to do.
 */
const enter = () => {
  block()!.focus();
  fireEvent.keyDown(field(), { key: "Enter" });
};
/** The block's visible line, which assistive tech skips, as its live region says it. */
const lineOf = (el: HTMLElement) => Array.from(el.querySelectorAll("[data-barcode-line]")).map((p) => p.textContent);
/** The live region's text. */
const liveOf = (el: HTMLElement) => el.querySelector("[aria-live]")?.textContent ?? null;
/** Waits until the block's line reads `line`. */
const says = (line: string) => waitFor(() => expect(lineOf(block()!)).toEqual([line]));
/** The elements holding exactly `text` that a screen reader reaches. */
const spoken = (el: HTMLElement, text: string) =>
  Array.from(el.querySelectorAll("*")).filter(
    (node) =>
      Array.from(node.childNodes).some((c) => c.nodeType === Node.TEXT_NODE && c.textContent === text) &&
      node.closest("[aria-hidden='true']") === null,
  );

describe("FoodSheet in barcode mode", () => {
  it("sends no search and shows no meal or browse buttons, and leaving it brings the search back", async () => {
    renderSheet();
    type(CODE);
    await settle();
    expect(searchFoods).not.toHaveBeenCalled();
    expect(block()).not.toBeNull();
    for (const name of ["New meal", "Add an estimate", "New food", `Save “${CODE}” as a meal`]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(body().querySelector("[data-list]")).toBeNull();

    type("rahka");
    await settle();
    expect(searchFoods).toHaveBeenCalledWith("rahka", expect.anything());
    // The code itself never went out as a name, also while the debounced text still held it.
    expect(searchFoods).not.toHaveBeenCalledWith(CODE, expect.anything());
    expect(block()).toBeNull();
    expect(await screen.findByRole("button", { name: /^Rahka, maustettu/ })).toBeInTheDocument();
  });

  it.each([
    ["7 digits", "1234567", false],
    ["8 digits", "12345670", true],
    ["14 digits", "64084300002580", true],
    ["15 digits", "640843000025801", false],
    ["spaces", "6408 4300 00258", true],
  ])("reads %s as a barcode or not", async (_what, text, isBarcode) => {
    renderSheet();
    type(text);
    await settle();
    expect(block() !== null).toBe(isBarcode);
  });

  it.each([["330"], ["2024"]])("searches %s by name, as numbers too short for a barcode", async (text) => {
    renderSheet();
    type(text);
    await settle();
    expect(block()).toBeNull();
    expect(searchFoods).toHaveBeenCalledWith(text, expect.anything());
  });

  it("sends nothing while typing, and one lookup per press of Look up", async () => {
    renderSheet();
    for (let n = 8; n <= CODE.length; n += 1) {
      type(CODE.slice(0, n));
      await settle();
    }
    expect(lookupBarcode).not.toHaveBeenCalled();
    lookUp();
    await waitFor(() => expect(lookups.sent).toEqual([CODE]));
  });

  it("looks up on Enter", async () => {
    renderSheet();
    type(CODE);
    enter();
    await waitFor(() => expect(lookups.sent).toEqual([CODE]));
  });

  it("sends nothing for a second press, or Enter, while the code is pending", async () => {
    lookups.hold = true;
    renderSheet();
    type(CODE);
    lookUp();
    await waitFor(() => expect(lookups.sent).toHaveLength(1));
    lookUp();
    enter();
    await act(async () => {});
    expect(lookups.sent).toEqual([CODE]);
    expect(within(block()!).getByRole("button", { name: "Looking up…" })).toHaveAttribute("aria-disabled", "true");
  });

  it("forgets the answer when the text stops naming the code", async () => {
    renderSheet();
    type(CODE);
    lookUp();
    await says(`No food has the barcode ${CODE}.`);
    type(`${CODE.slice(0, -1)}9`);
    expect(within(block()!).getByRole("button", { name: "Look up" })).toBeInTheDocument();
    type(CODE);
    expect(within(block()!).getByRole("button", { name: "Look up" })).toBeInTheDocument();
    expect(lookups.sent).toEqual([CODE]);
  });

  it.each([
    ["not_found", () => answerWith(CODE, { result: "not_found", barcode: CODE })],
    ["failed", () => failWith(CODE, refusal(503, "barcode_lookup_unavailable"))],
  ])(
    "keeps the field and the block's heading in place, as the same nodes, from typed to pending to %s",
    async (last, arrange) => {
      lookups.hold = true;
      arrange();
      renderSheet();
      const input = field();
      type(CODE);
      const first = block()!;
      const heading = first.firstElementChild;
      const seen: string[] = [];
      const record = () => {
        // The same field, and the same block with the same heading first, holding the same least height.
        expect(field()).toBe(input);
        expect(block()).toBe(first);
        expect(first.firstElementChild).toBe(heading);
        expect(heading).toHaveTextContent(`Barcode ${CODE}`);
        expect(first.className.split(" ")).toContain("min-h-68.5");
        // Nothing comes before the block in the body's view.
        expect(body().querySelector("[data-barcode-result]")?.previousElementSibling ?? null).toBeNull();
        seen.push(first.getAttribute("data-barcode-result")!);
      };
      record();
      lookUp();
      await waitFor(() => expect(lookups.sent).toHaveLength(1));
      record();
      await releaseLookups();
      await waitFor(() => expect(first).toHaveAttribute("data-barcode-result", last));
      record();
      expect(seen).toEqual(["typed", "pending", last]);
      // The mode held while the answer landed: no search went out and no list showed.
      expect(searchFoods).not.toHaveBeenCalled();
      expect(body().querySelector("[data-list]")).toBeNull();
    },
  );

  it("says Looking up while the lookup is out, and the typed state says what Look up does", async () => {
    lookups.hold = true;
    renderSheet();
    type(CODE);
    const hint = within(block()!).getByText("Finds it among your foods and on Open Food Facts.");
    // Look up comes first, so the line under it never pushes it under a phone's keyboard.
    const button = within(block()!).getByRole("button", { name: "Look up" });
    expect(button.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.className.split(" ")).toContain("bg-accent");
    expect(liveOf(block()!)).toBe("");
    lookUp();
    await waitFor(() => expect(liveOf(block()!)).toBe("Looking up…"));
    // The busy button says it on screen. The line under the heading holds still.
    expect(within(block()!).getByText("Finds it among your foods and on Open Food Facts.")).toBeInTheDocument();
  });

  it("moves focus to the block when the answer replaces the busy button that held it", async () => {
    lookups.hold = true;
    renderSheet();
    type(CODE);
    const button = within(block()!).getByRole("button", { name: "Look up" });
    button.focus();
    fireEvent.click(button);
    await waitFor(() => expect(lookups.sent).toHaveLength(1));
    expect(document.activeElement).toBe(button);
    await releaseLookups();
    await waitFor(() => expect(document.activeElement).toBe(block()));
    expect(block()).toHaveAccessibleName(`Barcode ${CODE}`);
  });
});

/** Each state other than found and pending: the line it shows and the buttons it offers. */
const states: Array<[string, () => void, string, string[]]> = [
  [
    "not found",
    () => answerWith(CODE, { result: "not_found", barcode: CODE }),
    `No food has the barcode ${CODE}.`,
    ["Search by name", "Add it from the label", "Scan again"],
  ],
  [
    "a shop's own barcode",
    () => answerWith(CODE, { result: "in_store", barcode: CODE }),
    "This is the shop's own barcode. It can change from pack to pack, so it finds no product.",
    ["Search by name", "Add it from the label", "Scan again"],
  ],
  [
    "digits no barcode has",
    () => answerWith(CODE, { result: "wrong_digits", barcode: CODE }),
    "No barcode has these digits. Check them against the pack.",
    ["Search by name", "Scan again"],
  ],
  [
    "an answer a newer server sends that this build does not know",
    () => answerWith(CODE, { result: "some_new_answer", barcode: CODE } as unknown as BarcodeLookup),
    `No food has the barcode ${CODE}.`,
    ["Search by name", "Scan again"],
  ],
  ...(
    [
      ["missing_values", "Eila", "Open Food Facts has Eila without all four values."],
      ["missing_values", null, "Open Food Facts has this product without all four values."],
      ["implausible_values", "Eila", "Open Food Facts has figures for Eila that cannot all be right."],
      ["implausible_values", null, "Open Food Facts has figures for this product that cannot all be right."],
    ] as const
  ).map(([reason, name, line]): [string, () => void, string, string[]] => [
    `incomplete, ${reason}, ${name ?? "no name"}`,
    () =>
      answerWith(CODE, {
        result: "incomplete",
        barcode: CODE,
        reason,
        product: { name, per100g: { energyKcal: 39, proteinG: null, carbsG: 4.9, fatG: 1.5 } },
      }),
    line,
    ["Search by name", "Complete it from the label", "Scan again"],
  ]),
  [
    "Open Food Facts down",
    () => failWith(CODE, refusal(503, "barcode_lookup_unavailable")),
    "Open Food Facts did not answer.",
    ["Try again", "Search by name", "Add it from the label"],
  ],
  [
    "too many lookups for the server",
    () => failWith(CODE, refusal(429, "barcode_lookup_busy")),
    "Too many lookups at once. Try again in a few seconds.",
    ["Try again", "Search by name", "Add it from the label"],
  ],
  [
    "the person's hourly limit",
    () => failWith(CODE, refusal(429, "barcode_lookup_limit")),
    "You have looked up many barcodes this hour. Try again later.",
    ["Search by name", "Add it from the label"],
  ],
  [
    "a bare server error, as when the product could not be stored",
    () => failWith(CODE, refusal(500, "internal_error")),
    "The lookup did not work.",
    ["Try again"],
  ],
  [
    "a server error with no barcode code",
    () => failWith(CODE, refusal(503, "internal_error")),
    "The lookup did not work.",
    ["Try again"],
  ],
  [
    "no answer at all",
    () => failWith(CODE, new AxiosError("Network Error", "ERR_NETWORK")),
    "The lookup did not work.",
    ["Try again"],
  ],
];

/** A browser that can ask for a camera, as over https, for as long as the test runs. */
describe.each([
  ["where the browser can ask for a camera", true],
  ["where it cannot, as on plain http", false],
])("FoodSheet's barcode block, state by state, %s", (_where, camera) => {
  let restore: (() => void) | null = null;
  beforeEach(() => {
    if (camera) restore = installCameraApiOnly();
  });
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it.each(states)("%s: says so and offers its actions, in their one order", async (_state, arrange, line, buttons) => {
    arrange();
    renderSheet();
    type(CODE);
    lookUp();
    await says(line);
    // Scan again shows by the camera button's own rule, so never without a camera API.
    expect(buttonsIn(block()!)).toEqual(camera ? buttons : buttons.filter((b) => b !== "Scan again"));
    // The live region says the line, and a screen reader reaches it once.
    expect(liveOf(block()!)).toBe(line);
    expect(spoken(block()!, line)).toHaveLength(1);
    expect(within(dialog()).queryByRole("button", { name: "Back" })).toBeNull();
  });
});

describe("FoodSheet's barcode block, its actions", () => {
  it("Try again sends the lookup again, and its answer takes the block's place", async () => {
    failWith(CODE, refusal(503, "barcode_lookup_unavailable"));
    renderSheet();
    type(CODE);
    lookUp();
    await says("Open Food Facts did not answer.");
    answerWith(CODE, { result: "not_found", barcode: CODE });
    fireEvent.click(within(block()!).getByRole("button", { name: "Try again" }));
    await says(`No food has the barcode ${CODE}.`);
    expect(lookups.sent).toEqual([CODE, CODE]);
  });
});
