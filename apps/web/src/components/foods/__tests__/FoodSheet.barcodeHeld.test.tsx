import { confirmArmed, openSheet } from "@/__tests__/sheet";
import { lookupBarcode, setFavourite, updateFood } from "@/lib/api/foods";
import { getSavedMeals } from "@/lib/api/savedMeals";
import type { FoodDetail } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { failWith, installLookups, lookups, releaseLookups } from "./barcodeServer";
import { addOwn, back, body, dialog, field, installServer, renderSheet, server, type } from "./foodSheetServer";
import { detailOf, ownFood, refusal } from "./support";

// What the barcode block holds when the truth moves under it: a found food
// deleted, gone or given another barcode, the connection lost and back, and
// where focus lands when the block's button leaves the page.

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

jest.setTimeout(15_000);

const CODE = "6408430000258";
let mine: FoodDetail;

beforeEach(() => {
  installServer();
  installLookups();
  jest.mocked(getSavedMeals).mockReset().mockResolvedValue({ meals: [] });
  mine = detailOf(ownFood("Oma maito"), { barcode: CODE });
  addOwn(mine);
});

const block = () => body().querySelector<HTMLElement>("[data-barcode-result]");
const heldRow = () => block()?.querySelector<HTMLElement>('[data-list="barcode"] [data-food-row]') ?? null;
const lookUpButton = () => within(block()!).queryByRole("button", { name: /^Look up|^Looking up/ });
const foodView = () => within(dialog()).queryByRole("heading", { level: 2, name: "Oma maito" });

/** Types the code, looks it up and waits for the found food's view. */
async function findMine(): Promise<void> {
  renderSheet();
  type(CODE);
  fireEvent.click(lookUpButton()!);
  await waitFor(() => expect(foodView()).not.toBeNull());
}

/** Sets what the browser says of its connection, as its `online` and `offline` events do. */
function setOnline(online: boolean): void {
  jest.spyOn(navigator, "onLine", "get").mockReturnValue(online);
  act(() => {
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  });
}

afterEach(() => jest.restoreAllMocks());

describe("FoodSheet's barcode block, a held answer that is no longer true", () => {
  it("drops a found food once it is deleted: the same code shows Look up and sends again", async () => {
    await findMine();
    fireEvent.click(screen.getByRole("button", { name: "Delete food" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Oma maito?" });
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(field()).toHaveValue(""));
    type(CODE);
    expect(heldRow()).toBeNull();
    expect(lookUpButton()).toHaveTextContent("Look up");
    fireEvent.click(lookUpButton()!);
    await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", "not_found"));
    expect(lookups.sent).toEqual([CODE, CODE]);
  });

  it("drops a found food that turns out to be gone, so no tap loops on it", async () => {
    await findMine();
    delete server.foods[mine.id];
    jest.mocked(setFavourite).mockRejectedValue(refusal(404, "food_not_found"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Favourite" }));
    expect(await screen.findByText("This food is no longer available.")).toBeInTheDocument();
    expect(field()).toHaveValue(CODE);
    expect(heldRow()).toBeNull();
    expect(lookUpButton()).toHaveTextContent("Look up");
  });

  it.each([
    ["cleared", ""],
    ["changed", "6411401015090"],
  ])("drops a found food whose barcode an edit %s", async (_what, barcode) => {
    jest.mocked(updateFood).mockImplementation(async (id, body) => {
      server.foods[id] = { ...server.foods[id], name: body.name, barcode: body.barcode };
      return server.foods[id];
    });
    await findMine();
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Edit food" }));
    const sheet = await waitFor(() => openSheet("Edit food")!);
    fireEvent.change(within(sheet).getByLabelText("Barcode (optional)"), { target: { value: barcode } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await waitFor(() => expect(openSheet("Edit food")).toBeNull());
    back();
    await waitFor(() => expect(block()).not.toBeNull());
    expect(heldRow()).toBeNull();
    expect(lookUpButton()).toHaveTextContent("Look up");
  });

  it("keeps a found food whose edit keeps its barcode, as it now is", async () => {
    jest.mocked(updateFood).mockImplementation(async (id, body) => {
      server.foods[id] = { ...server.foods[id], name: body.name, barcode: body.barcode };
      return server.foods[id];
    });
    await findMine();
    fireEvent.click(await within(dialog()).findByRole("button", { name: "Edit food" }));
    const sheet = await waitFor(() => openSheet("Edit food")!);
    fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: "Oma kevytmaito" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Save food" }));
    await waitFor(() => expect(openSheet("Edit food")).toBeNull());
    back();
    await waitFor(() => expect(heldRow()).toHaveTextContent("Oma kevytmaito"));
    expect(lookups.sent).toEqual([CODE]);
  });
});

describe("FoodSheet's barcode block, offline", () => {
  it("says a lookup needs a connection and sends nothing, and Look up is back with the connection", async () => {
    setOnline(false);
    renderSheet();
    type(CODE);
    block()!.focus();
    fireEvent.keyDown(field(), { key: "Enter" });
    await act(async () => {});
    expect(block()!.querySelector("[aria-live]")).toHaveTextContent("Looking up a barcode needs a connection.");
    expect(within(block()!).queryAllByRole("button")).toEqual([]);
    expect(lookupBarcode).not.toHaveBeenCalled();

    setOnline(true);
    expect(lookUpButton()).toHaveTextContent("Look up");
    expect(block()!.querySelector("[aria-live]")).toHaveTextContent("");
    fireEvent.click(lookUpButton()!);
    await waitFor(() => expect(foodView()).not.toBeNull());
    expect(lookups.sent).toEqual([CODE]);
  });
});

describe("FoodSheet's barcode block, focus when its button leaves", () => {
  it("Try again: focus goes to the block while the lookup is out and stays there for the answer", async () => {
    mine.barcode = null;
    lookups.hold = true;
    failWith(CODE, refusal(503, "barcode_lookup_unavailable"));
    renderSheet();
    type(CODE);
    fireEvent.click(lookUpButton()!);
    await waitFor(() => expect(lookups.sent).toHaveLength(1));
    await releaseLookups();
    const again = await within(block()!).findByRole("button", { name: "Try again" });
    again.focus();
    fireEvent.click(again);
    await waitFor(() => expect(lookups.sent).toHaveLength(2));
    expect(document.activeElement).toBe(block());
    // Focus that fell to the sheet itself, as a browser's focus manager puts it, is lost too.
    dialog().focus();
    await releaseLookups();
    await waitFor(() => expect(within(block()!).queryByRole("button", { name: "Try again" })).not.toBeNull());
    expect(document.activeElement).toBe(block());
  });

  it("offline: Look up leaves with the connection, and focus goes to the block", async () => {
    renderSheet();
    type(CODE);
    lookUpButton()!.focus();
    setOnline(false);
    expect(lookUpButton()).toBeNull();
    expect(document.activeElement).toBe(block());
  });

  it("keeps focus in the search field when typing changes the block's state", async () => {
    mine.barcode = null;
    renderSheet();
    type(CODE);
    fireEvent.click(lookUpButton()!);
    await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", "not_found"));
    field().focus();
    type(`${CODE}1`);
    type(CODE.slice(0, -1) + "9");
    expect(block()).toHaveAttribute("data-barcode-result", "typed");
    expect(document.activeElement).toBe(field());
  });

  it.each([
    ["a field in it", (sheet: HTMLElement) => within(sheet).getByLabelText("Name")],
    ["the sheet itself", (sheet: HTMLElement) => sheet],
  ])("leaves focus on %s in the label form stacked over the block when the block changes", async (_what, target) => {
    mine.barcode = null;
    failWith(CODE, refusal(503, "barcode_lookup_unavailable"));
    renderSheet();
    type(CODE);
    fireEvent.click(lookUpButton()!);
    fireEvent.click(await within(block()!).findByRole("button", { name: "Add it from the label" }));
    const sheet = await waitFor(() => openSheet("Add a food")!);
    const focused = target(sheet);
    focused.focus();
    expect(document.activeElement).toBe(focused);
    setOnline(false);
    expect(block()).toHaveAttribute("data-barcode-result", "offline");
    expect(document.activeElement).toBe(focused);
  });

  it("keeps focus in the search field when the connection comes back while typing", async () => {
    setOnline(false);
    renderSheet();
    type(CODE);
    field().focus();
    setOnline(true);
    expect(document.activeElement).toBe(field());
  });
});
