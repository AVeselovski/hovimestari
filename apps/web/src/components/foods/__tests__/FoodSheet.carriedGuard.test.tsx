import { tap } from "@/__tests__/helpers/tap";
import { viewHoldPassed } from "@/__tests__/sheet";
import { DayLauncher } from "@/components/day/DayLauncher";
import { ARM_DELAY_MS } from "@/hooks/usePressGuard";
import { getSavedMeals } from "@/lib/api/savedMeals";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FoodSheet } from "../FoodSheet";
import { installLookups } from "./barcodeServer";
import { addOwn, body, dialog, field, installServer, rowNames, type } from "./foodSheetServer";
import { detailOf, fakeLogActions, fineliFood, listsInPlace, ownFood, SHEET_DATE } from "./support";

// What the log sheet's carried barcode must not do: let the second tap of a
// double tap on Forget the barcode open the row that moves up under it, or
// outlive a log. The fake server answers what it holds (./barcodeServer.ts).

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

jest.setTimeout(15000);

const CODE = "6416710030208";

beforeEach(() => {
  installServer();
  installLookups();
  jest.mocked(getSavedMeals).mockReset().mockResolvedValue({ meals: [] });
});
afterEach(() => jest.useRealTimers());

const block = () => body().querySelector<HTMLElement>("[data-barcode-result]");
const carried = () => body().querySelector<HTMLElement>("[data-carried-line]");
const opened = () => within(dialog()).queryByRole("button", { name: "Back" });

/** Looks the code up, waits for a miss, then runs `before` and presses Search by name. */
async function missThenSearch(before: () => void = () => {}): Promise<void> {
  type(CODE);
  fireEvent.click(within(block()!).getByRole("button", { name: "Look up" }));
  await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", "not_found"));
  before();
  fireEvent.click(within(block()!).getByRole("button", { name: "Search by name" }));
}

describe("Forget the barcode", () => {
  it("opens no row that moves up under the finger until a double tap is over", async () => {
    addOwn(detailOf(ownFood("Ruisleipä")));
    render(<FoodSheet open onClose={jest.fn()} returnFocusTo={null} date={SHEET_DATE} actions={fakeLogActions()} />);
    await waitFor(() => expect(rowNames()).toContain("Ruisleipä"));
    await listsInPlace();
    // The fake clock from Search by name on.
    await missThenSearch(() => jest.useFakeTimers());
    // Search by name's own hold is over before the person reaches Forget.
    act(() => jest.advanceTimersByTime(ARM_DELAY_MS));
    fireEvent.click(within(carried()!).getByRole("button", { name: "Forget the barcode" }));
    expect(carried()).toBeNull();
    const row = within(body()).getByRole("button", { name: /^Ruisleipä/ });
    // The second tap, at once, lands on the row the line gave its place to.
    expect(tap(row).defaultPrevented).toBe(true);
    expect(opened()).toBeNull();
    act(() => jest.advanceTimersByTime(ARM_DELAY_MS - 1));
    expect(tap(row).defaultPrevented).toBe(true);
    act(() => jest.advanceTimersByTime(1));
    expect(tap(row).defaultPrevented).toBe(false);
    expect(opened()).toBeInTheDocument();
  });
});

describe("a log", () => {
  it("ends the carry: the sheet the day opens next shows no carried line", async () => {
    const bread = detailOf(fineliFood("Ruisleipä"));
    addOwn(bread);
    const actions = fakeLogActions();
    actions.add.mockResolvedValue({ outcome: "created", announce: jest.fn() });
    // The day's own launcher, which keys a fresh sheet on every open.
    render(<DayLauncher date={SHEET_DATE} future={false} actions={actions} />);
    const launcher = screen.getByRole("button", { name: "Log food" });
    fireEvent.click(launcher);
    await missThenSearch();
    expect(carried()).not.toBeNull();
    await waitFor(() => expect(body().querySelector('[data-press-guard="waiting"]')).toBeNull(), { timeout: 2000 });
    type("ruis");
    const row = await within(body()).findByRole("button", { name: /^Ruisleipä/ });
    await listsInPlace();
    tap(row);
    await waitFor(() => expect(opened()).not.toBeNull());
    await viewHoldPassed();
    fireEvent.change(within(dialog()).getByRole("textbox", { name: "Amount" }), { target: { value: "40" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: /^(Log|Add to plan)$/ }));
    await waitFor(() => expect(actions.add).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The sheet that opens next is a new one, on its search, with nothing carried.
    fireEvent.click(launcher);
    await waitFor(() => expect(field()).toHaveValue(""));
    expect(opened()).toBeNull();
    expect(carried()).toBeNull();
  });
});
