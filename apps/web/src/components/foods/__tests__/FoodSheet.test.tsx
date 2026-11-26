import { stubPhone } from "@/__tests__/formSheet";
import { deferred } from "@/__tests__/helpers/queryClient";
import { confirmArmed } from "@/__tests__/sheet";
import {
  addPortion,
  createFood,
  deleteFood,
  getFavouriteFoods,
  getFood,
  getOwnFoods,
  searchFoods,
  setFavourite,
} from "@/lib/api/foods";
import type { FoodDetail, FoodSearchResult, FoodSummary } from "@hovimestari/types";
import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FoodSheet, SEARCH_DEBOUNCE_MS } from "../FoodSheet";
import {
  detailOf,
  fakeLogActions,
  favouriteOf,
  fineliFood,
  fineliPortion,
  listsInPlace,
  ownFood,
  ownPortion,
  refusal,
  SHEET_DATE,
} from "./support";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn().mockResolvedValue({ items: [] }) }));
jest.mock("@/lib/api/recipes", () => ({ getRecipes: jest.fn().mockResolvedValue({ recipes: [] }) }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn().mockResolvedValue({ meals: [] }),
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
}));

const quarks = [fineliFood("Rahka, maustettu"), fineliFood("Rahka, maustamaton"), fineliFood("Rahka, vaniljalla")];
let favourites: FoodSummary[] = [];
let own: FoodSummary[] = [];
let results: Record<string, FoodSummary[]> = {};
let details: Record<string, FoodDetail> = {};

beforeEach(() => {
  favourites = [];
  own = [];
  results = { rahka: quarks };
  details = Object.fromEntries(quarks.map((q) => [q.id, detailOf(q)]));
  jest
    .mocked(searchFoods)
    .mockReset()
    .mockImplementation((q) => Promise.resolve({ foods: results[q] ?? [], near: [] }));
  jest
    .mocked(getFavouriteFoods)
    .mockReset()
    .mockImplementation(() => Promise.resolve({ foods: favourites.map(favouriteOf) }));
  jest
    .mocked(getOwnFoods)
    .mockReset()
    .mockImplementation(() => Promise.resolve({ foods: own }));
  jest
    .mocked(getFood)
    .mockReset()
    .mockImplementation((id) =>
      details[id] ? Promise.resolve(details[id]) : Promise.reject(refusal(404, "food_not_found")),
    );
  jest.mocked(setFavourite).mockReset().mockResolvedValue(undefined);
  jest.mocked(deleteFood).mockReset().mockResolvedValue(undefined);
  jest.mocked(createFood).mockReset();
  jest.mocked(addPortion).mockReset();
});

afterEach(() => onlineManager.setOnline(true));

function renderSheet() {
  const onClose = jest.fn();
  render(<FoodSheet open onClose={onClose} returnFocusTo={null} date={SHEET_DATE} actions={fakeLogActions()} />);
  return { onClose };
}

const dialog = () => screen.getByRole("dialog");
const field = () => screen.getByLabelText("Search foods, meals and recipes") as HTMLInputElement;
const type = (value: string) => fireEvent.change(field(), { target: { value } });
const body = () => dialog().querySelector<HTMLElement>("[data-sheet-body]")!;
const header = () => dialog().querySelector<HTMLElement>("[data-sheet-header]")!;
const rowButton = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
/** Long enough for the debounce to settle and the answer to land. */
const settle = () => act(() => new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 100)));

async function openDetail(name: string) {
  const row = await screen.findByRole("button", { name: new RegExp(`^${name}`) });
  await listsInPlace();
  fireEvent.click(row);
  return screen.findByRole("button", { name: "Back" });
}

describe("FoodSheet, searching", () => {
  it("sends one request per settled query, keyed by the trimmed text", async () => {
    renderSheet();
    for (const v of ["r", "ra", "rah", "rahk", " rahka "]) type(v);
    expect(await screen.findByText("Rahka, maustettu")).toBeInTheDocument();
    await settle();
    expect(searchFoods).toHaveBeenCalledTimes(1);
    expect(searchFoods).toHaveBeenCalledWith("rahka", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("sends nothing for one character, and browses instead", async () => {
    renderSheet();
    type("r");
    await settle();
    type(" k ");
    await settle();
    expect(searchFoods).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole("heading", { name: "Favourites" })).toBeInTheDocument();
  });

  it("aborts the request a newer query replaces", async () => {
    const first = deferred<FoodSearchResult>();
    jest.mocked(searchFoods).mockImplementationOnce(() => first.promise);
    renderSheet();
    type("ra");
    await waitFor(() => expect(searchFoods).toHaveBeenCalledTimes(1));
    const firstSignal = jest.mocked(searchFoods).mock.calls[0][1]!.signal!;
    expect(firstSignal.aborted).toBe(false);
    type("rahka");
    await waitFor(() => expect(searchFoods).toHaveBeenCalledTimes(2));
    expect(firstSignal.aborted).toBe(true);
    expect(await screen.findByText("Rahka, maustettu")).toBeInTheDocument();
  });

  it("keeps the search field in place, the same element, in browse, results, no results and back", async () => {
    renderSheet();
    const input = field();
    expect(header()).toContainElement(input);
    type("rahka");
    await screen.findByText("Rahka, maustettu");
    expect(field()).toBe(input);
    type("xyzzy");
    await screen.findByText("No food matches “xyzzy”.");
    expect(field()).toBe(input);
    type("");
    await screen.findByRole("heading", { name: "Favourites" });
    expect(field()).toBe(input);
    expect(header()).toContainElement(input);
  });

  it("is the tall sheet, whose height never follows its content", () => {
    renderSheet();
    expect(dialog()).toHaveAttribute("data-sheet-size", "tall");
    expect(dialog().className.split(" ")).toEqual(
      expect.arrayContaining(["h-[calc(100dvh-var(--safe-top)-3rem)]", "md:h-[min(48rem,calc(100dvh-2rem))]"]),
    );
  });

  it("offers to add a query no food matches as the user's own food, with the name filled in", async () => {
    renderSheet();
    type("Mummon pulla");
    expect(await screen.findByText("No food matches “Mummon pulla”.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add “Mummon pulla” as your own food" }));
    const sheet = await screen.findByRole("dialog", { name: "Add a food" });
    expect(within(sheet).getByLabelText("Name")).toHaveValue("Mummon pulla");
    expect(within(sheet).getByLabelText("Energy")).toHaveValue("");
  });

  it("says search needs a connection when offline, and sends nothing", async () => {
    onlineManager.setOnline(false);
    renderSheet();
    type("rahka");
    expect(await screen.findByText("Search needs a connection.")).toBeInTheDocument();
    expect(searchFoods).not.toHaveBeenCalled();
  });

  it("says search did not work on a failure, and tries again on request", async () => {
    jest.mocked(searchFoods).mockRejectedValueOnce(refusal(500, "invalid_request"));
    renderSheet();
    type("rahka");
    expect(await screen.findByText("Search did not work.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Rahka, maustettu")).toBeInTheDocument();
  });

  it("focuses no field as it opens on a phone, not even for a moment", () => {
    const restore = stubPhone();
    const focused: Element[] = [];
    const record = (e: FocusEvent) => focused.push(e.target as Element);
    document.addEventListener("focusin", record);
    try {
      renderSheet();
      expect(focused.filter((el) => el.tagName === "INPUT")).toEqual([]);
      expect(document.activeElement?.tagName).not.toBe("INPUT");
    } finally {
      document.removeEventListener("focusin", record);
      restore();
    }
  });

  it("focuses the search field as it opens from md", () => {
    renderSheet();
    expect(field()).toHaveFocus();
  });
});

describe("FoodSheet, where the body is scrolled", () => {
  it("goes to the top when the results replace the lists, so the best match is in view", async () => {
    const answer = deferred<FoodSearchResult>();
    jest.mocked(searchFoods).mockReturnValueOnce(answer.promise);
    renderSheet();
    type("rahka");
    await settle();
    // The lists still show while the first answer is out: scrolled down in them, as a person may.
    body().scrollTop = 300;
    await act(async () => answer.resolve({ foods: quarks, near: [] }));
    await screen.findByText("Rahka, maustamaton");
    expect(body().scrollTop).toBe(0);
  });

  it("goes to the top when the text changes while results show", async () => {
    results.rahk = quarks;
    renderSheet();
    type("rahka");
    await screen.findByText("Rahka, maustamaton");
    body().scrollTop = 120;
    type("rahk");
    expect(body().scrollTop).toBe(0);
  });

  it("keeps where browsing was left on Back from a food, and goes to the top once text is typed", async () => {
    own = [ownFood("Oma rahka")];
    details[own[0].id] = detailOf(own[0]);
    renderSheet();
    await screen.findByText("Oma rahka");
    body().scrollTop = 300;
    fireEvent.click(await openDetail("Oma rahka"));
    expect(body().scrollTop).toBe(300);
    expect(rowButton("Oma rahka")).toHaveFocus();
    type("rahka");
    expect(body().scrollTop).toBe(0);
  });
});

describe("FoodSheet, a food's detail", () => {
  it("Back restores the query, the results and the scroll position, and focuses the row that was opened", async () => {
    renderSheet();
    type("rahka");
    await screen.findByText("Rahka, maustamaton");
    body().scrollTop = 120;
    const back = await openDetail("Rahka, maustamaton");
    // The name scrolls with the body. The fixed header holds Back and the star, and the dialog keeps the name.
    expect(within(body()).getByRole("heading", { name: "Rahka, maustamaton" })).toBeInTheDocument();
    expect(within(header()).queryByRole("heading")).toBeNull();
    expect(within(header()).getByRole("button", { name: "Favourite" })).toBeInTheDocument();
    expect(dialog()).toHaveAccessibleName("Rahka, maustamaton");
    expect(back).toHaveFocus();
    expect(body().scrollTop).toBe(0);
    fireEvent.click(back);
    expect(field()).toHaveValue("rahka");
    expect(screen.getByText("Rahka, maustettu")).toBeInTheDocument();
    expect(body().scrollTop).toBe(120);
    expect(rowButton("Rahka, maustamaton")).toHaveFocus();
    expect(searchFoods).toHaveBeenCalledTimes(1);
  });

  it("with no favourites, says where the star is that keeps a food there", async () => {
    renderSheet();
    const favouritesList = await screen.findByRole("region", { name: "Favourites" });
    await waitFor(() => expect(favouritesList).toHaveTextContent("Tap any food here or in search, then tap its star."));
  });

  it("flips the favourite at once, in the detail and the favourites list, and rolls both back on a 500", async () => {
    const mine = ownFood("Oma rahka");
    own = [mine];
    details[mine.id] = detailOf(mine);
    const answer = deferred<void>();
    jest.mocked(setFavourite).mockReturnValueOnce(answer.promise);
    renderSheet();
    await openDetail("Oma rahka");
    const star = screen.getByRole("button", { name: "Favourite" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    // Every read after the failure hangs, so only the rollback can take the mark back.
    jest.mocked(getFavouriteFoods).mockImplementation(() => new Promise(() => {}));
    jest.mocked(getOwnFoods).mockImplementation(() => new Promise(() => {}));
    jest.mocked(getFood).mockImplementation(() => new Promise(() => {}));
    fireEvent.click(star);
    // Flipped while the write is still held: nothing waits for the server.
    await waitFor(() => expect(star).toHaveAttribute("aria-pressed", "true"));
    expect(setFavourite).toHaveBeenCalledWith(mine.id, true);

    // Back while the write runs: the favourites list already holds it.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    const favouritesList = () => screen.getByRole("region", { name: "Favourites" });
    await waitFor(() => expect(within(favouritesList()).getByText("Oma rahka")).toBeInTheDocument());

    await act(async () => answer.reject(refusal(500, "invalid_request")));
    await waitFor(() => expect(within(favouritesList()).queryByText("Oma rahka")).not.toBeInTheDocument());
    await openDetail("Oma rahka");
    expect(screen.getByRole("button", { name: "Favourite" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the failure of a favourite mark in the detail", async () => {
    jest.mocked(setFavourite).mockRejectedValueOnce(refusal(500, "invalid_request"));
    renderSheet();
    type("rahka");
    await openDetail("Rahka, maustettu");
    fireEvent.click(screen.getByRole("button", { name: "Favourite" }));
    // The star's line in the body, not the log block's refusal line in the footer.
    expect(await within(body()).findByRole("alert")).toHaveTextContent("Something went wrong. Try again.");
    expect(screen.getByRole("button", { name: "Favourite" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a Fineli food's figures, its source with the link to the credit, and no Edit or Delete", async () => {
    renderSheet();
    type("rahka");
    await openDetail("Rahka, maustettu");
    const figures = within(body()).getByRole("region", { name: "Per 100\u00a0g" });
    expect(within(figures).getByText("59 kcal")).toBeInTheDocument();
    expect(within(figures).getByText("12.4 g")).toBeInTheDocument();
    expect(within(figures).getByText("3.6 g")).toBeInTheDocument();
    expect(within(figures).getByText("0.2 g")).toBeInTheDocument();
    expect(screen.getByText("From Fineli")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About the food data" })).toHaveAttribute("href", "/settings#food-data");
    expect(screen.queryByRole("button", { name: "Edit food" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete food" })).not.toBeInTheDocument();
  });

  it("labels Fineli portions from the catalog, and lets only the user's own portion be edited", async () => {
    const food = quarks[0];
    details[food.id] = detailOf(food, {
      portions: [fineliPortion("KPL_M", 55), fineliPortion("DL", 102.5), ownPortion("Purkki", 200)],
    });
    renderSheet();
    type("rahka");
    await openDetail("Rahka, maustettu");
    const portions = await screen.findByRole("region", { name: "Portions" });
    await within(portions).findByText("Medium piece");
    expect(within(portions).getByText("55 g")).toBeInTheDocument();
    expect(within(portions).getByText("Decilitre")).toBeInTheDocument();
    expect(within(portions).getByText("102.5 g")).toBeInTheDocument();
    expect(within(portions).queryByRole("button", { name: /Medium piece/ })).not.toBeInTheDocument();
    fireEvent.click(within(portions).getByRole("button", { name: "Edit Purkki" }));
    const sheet = await screen.findByRole("dialog", { name: "Edit portion" });
    expect(within(sheet).getByLabelText("Weight")).toHaveValue("200");
  });

  it("shows Edit and Delete on the user's own food, and deleting it returns to browsing", async () => {
    const mine = ownFood("Oma rahka");
    own = [mine];
    details[mine.id] = detailOf(mine);
    renderSheet();
    await openDetail("Oma rahka");
    expect(screen.getByText("Your own food")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Edit food" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete food" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Oma rahka?" });
    own = [];
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteFood).toHaveBeenCalledWith(mine.id));
    expect(await screen.findByRole("heading", { name: "Favourites" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Foods you add appear here.")).toBeInTheDocument());
  });

  it("returns to the search with the gone line when the food answers 404", async () => {
    renderSheet();
    type("rahka");
    delete details[quarks[1].id];
    fireEvent.click(await screen.findByRole("button", { name: /^Rahka, maustamaton/ }));
    expect(await screen.findByText("This food is no longer available.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
    expect(field()).toHaveValue("rahka");
  });

  it("opens a new own food's detail once it is saved", async () => {
    const saved = detailOf(ownFood("Mummon pulla"), {
      per100g: { energyKcal: 350, proteinG: 8, carbsG: 50, fatG: 12 },
    });
    details[saved.id] = saved;
    jest.mocked(createFood).mockResolvedValue(saved);
    renderSheet();
    fireEvent.click(await screen.findByRole("button", { name: "Add your own food" }));
    const sheet = await screen.findByRole("dialog", { name: "Add a food" });
    fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "Mummon pulla" } });
    fireEvent.change(within(sheet).getByLabelText("Energy"), { target: { value: "350" } });
    fireEvent.change(within(sheet).getByLabelText("Protein"), { target: { value: "8" } });
    fireEvent.change(within(sheet).getByLabelText("Carbohydrates"), { target: { value: "50" } });
    fireEvent.change(within(sheet).getByLabelText("Fat"), { target: { value: "12" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await waitFor(() =>
      expect(createFood).toHaveBeenCalledWith({
        name: "Mummon pulla",
        per100g: { energyKcal: 350, proteinG: 8, carbsG: 50, fatG: 12 },
        barcode: null,
      }),
    );
    expect(await within(body()).findByRole("heading", { name: "Mummon pulla" })).toBeInTheDocument();
    expect(screen.getByText("350 kcal")).toBeInTheDocument();
  });
});
