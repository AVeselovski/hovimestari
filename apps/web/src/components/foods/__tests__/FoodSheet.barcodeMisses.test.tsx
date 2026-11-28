import { tap, tapClick } from "@/__tests__/helpers/tap";
import { holdSheetExits, openSheet } from "@/__tests__/sheet";
import { ARM_DELAY_MS } from "@/hooks/usePressGuard";
import { getSavedMeals } from "@/lib/api/savedMeals";
import { act, fireEvent, waitFor, within } from "@testing-library/react";
import { answerWith, failWith, installLookups, lookups, releaseLookups } from "./barcodeServer";
import { addOwn, body, dialog, field, installServer, renderSheet, rowNames, type } from "./foodSheetServer";
import { installCamera, type FakeCamera } from "./scannerFakes";
import { detailOf, listsInPlace, ownFood, refusal } from "./support";

// The log sheet's ways on from a barcode that found nothing: Search by name
// empties the field with the caret in it and brings the lists back, Scan
// again opens the scanner and a read of the same code looks it up again
// with the block held in place, and the label form keeps the barcode where
// a form opens at all. The fake server answers what it holds
// (./barcodeServer.ts), and the camera is stubbed (./scannerFakes.ts).

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

const CODE = "6416710030208";
/** Lidl's milk: an 8-digit code starting with 2, looked up like any other. */
const LIDL = "20064020";
/** The Filos code with its last digit wrong. */
const WRONG = "6416710030209";
const SCANNER = "Scan a barcode";

let camera: FakeCamera | null = null;
let restoreExits: (() => void) | null = null;

beforeEach(() => {
  installServer();
  installLookups();
  jest.mocked(getSavedMeals).mockReset().mockResolvedValue({ meals: [] });
});
afterEach(() => {
  restoreExits?.();
  restoreExits = null;
  camera?.uninstall();
  camera = null;
});

const block = () => body().querySelector<HTMLElement>("[data-barcode-result]");
const buttonIn = (name: string) => within(block()!).getByRole("button", { name });
const buttonsIn = () =>
  within(block()!)
    .queryAllByRole("button")
    .map((b) => b.textContent);
const scanner = () => openSheet(SCANNER);
const ownSheet = () => openSheet("New food");

/** Types `code`, presses Look up and waits for the block to hold `result`. */
async function missOn(code: string, result: string): Promise<void> {
  type(code);
  fireEvent.click(buttonIn("Look up"));
  await waitFor(() => expect(block()).toHaveAttribute("data-barcode-result", result));
}

describe("Search by name", () => {
  it("empties the field and puts the caret in it within the press, and the lists come back", async () => {
    answerWith(CODE, { result: "not_found", barcode: CODE });
    renderSheet();
    await missOn(CODE, "not_found");
    const input = field();
    const press = buttonIn("Search by name");
    // Focus on the button, as a press leaves it, so focus in the field is the press's doing.
    press.focus();
    act(() => {
      press.click();
      // Focus is the press's own, before React renders anything: iOS raises a keyboard for no later focus.
      expect(document.activeElement).toBe(input);
    });
    expect(field()).toBe(input);
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    // The barcode mode has ended: the block is gone and the browse lists show.
    expect(block()).toBeNull();
    await waitFor(() => expect(body().querySelector("[data-list]")).not.toBeNull());
    // Nothing more was sent.
    expect(lookups.sent).toEqual([CODE]);
  });

  it("does the same after a failure at Open Food Facts", async () => {
    failWith(CODE, refusal(503, "barcode_lookup_unavailable"));
    renderSheet();
    await missOn(CODE, "failed");
    const press = buttonIn("Search by name");
    press.focus();
    fireEvent.click(press);
    expect(field().value).toBe("");
    expect(document.activeElement).toBe(field());
    expect(block()).toBeNull();
  });
});

describe("what shows in the block's place after Search by name", () => {
  afterEach(() => jest.useRealTimers());

  const row = () => within(body()).getByRole("button", { name: /^Ruisleipä/ });
  const opened = () => within(dialog()).queryByRole("button", { name: "Back" });

  /** A miss over lists that already have their answer, as when a sheet is opened to scan, then Search by name, on the fake clock from the press on. */
  async function searchByNameOverLists(): Promise<void> {
    addOwn(detailOf(ownFood("Ruisleipä")));
    answerWith(CODE, { result: "not_found", barcode: CODE });
    renderSheet();
    await waitFor(() => expect(rowNames()).toContain("Ruisleipä"));
    await listsInPlace();
    await missOn(CODE, "not_found");
    jest.useFakeTimers();
    const press = buttonIn("Search by name");
    press.focus();
    fireEvent.click(press);
  }

  const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));

  it("opens no row until a double tap is over", async () => {
    await searchByNameOverLists();
    // The second tap, at once, on the row that took the button's place.
    expect(tap(row()).defaultPrevented).toBe(true);
    expect(opened()).toBeNull();
    wait(ARM_DELAY_MS);
    expect(tap(row()).defaultPrevented).toBe(false);
    expect(opened()).toBeInTheDocument();
  });

  it("stops a press that starts inside the half second and ends after it", async () => {
    await searchByNameOverLists();
    wait(ARM_DELAY_MS - 100);
    fireEvent.pointerDown(row());
    wait(200);
    fireEvent.pointerUp(row());
    expect(tapClick(row()).defaultPrevented).toBe(true);
    expect(opened()).toBeNull();
  });

  it("a touch that turns into a scroll holds no later press: a screen reader's activation opens the row", async () => {
    await searchByNameOverLists();
    wait(80);
    fireEvent.pointerDown(row());
    // The browser takes the touch for a scroll: no pointerup and no click follow.
    fireEvent.pointerCancel(row());
    wait(820);
    // A screen reader's activation, which can count as one click and comes with no pointerdown.
    expect(tapClick(row()).defaultPrevented).toBe(false);
    expect(opened()).toBeInTheDocument();
  });

  it("a press that never ended holds no Enter once the half second is over", async () => {
    await searchByNameOverLists();
    wait(80);
    fireEvent.pointerDown(row());
    wait(820);
    // Enter: a click with no pointer of its own (`detail` 0).
    fireEvent.click(row());
    expect(opened()).toBeInTheDocument();
  });
});

describe("presses after the clear cross and after a search", () => {
  const row = () => within(body()).getByRole("button", { name: /^Ruisleipä/ });
  const opened = () => within(dialog()).queryByRole("button", { name: "Back" });

  it("the clear cross holds no press: a row tapped at once opens", async () => {
    addOwn(detailOf(ownFood("Ruisleipä")));
    renderSheet();
    // The lists have their answer and are at rest, so only the clear cross could hold a press.
    await waitFor(() => expect(rowNames()).toContain("Ruisleipä"));
    await listsInPlace();
    type("maito");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Clear the search" }));
    await waitFor(() => expect(rowNames()).toContain("Ruisleipä"));
    tap(row());
    expect(opened()).toBeInTheDocument();
  });

  it("a search holds no press: a result tapped at once opens", async () => {
    addOwn(detailOf(ownFood("Ruisleipä")));
    renderSheet();
    type("ruis");
    await waitFor(() => expect(body().querySelector('[data-list="results"]')).not.toBeNull());
    tap(row());
    expect(opened()).toBeInTheDocument();
  });
});

describe("Scan again", () => {
  it("opens the scanner, and a dismissal gives focus back to Scan again", async () => {
    camera = installCamera();
    answerWith(CODE, { result: "not_found", barcode: CODE });
    renderSheet();
    await missOn(CODE, "not_found");
    const again = buttonIn("Scan again");
    again.focus();
    fireEvent.click(again);
    const sheet = await waitFor(() => scanner()!);
    await waitFor(() => expect(camera!.streams).toHaveLength(1));
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(scanner()).toBeNull());
    // Nothing changed under the scanner, so the button is still there to take focus back.
    await waitFor(() => expect(document.activeElement).toBe(buttonIn("Scan again")));
    expect(field().value).toBe(CODE);
    expect(lookups.sent).toEqual([CODE]);
  });

  it("a read of the same code looks it up again: Looking up at once, then the answer, the block and field held", async () => {
    // The scanner slides out with focus still in it, as in a browser, so the host must place focus.
    restoreExits = holdSheetExits();
    camera = installCamera();
    answerWith(CODE, { result: "not_found", barcode: CODE });
    renderSheet();
    await missOn(CODE, "not_found");
    const input = field();
    const first = block()!;
    const heading = first.firstElementChild;
    const seen: string[] = [];
    const record = () => {
      // The same field and the same block, with the same heading first.
      expect(field()).toBe(input);
      expect(block()).toBe(first);
      expect(first.firstElementChild).toBe(heading);
      expect(heading).toHaveTextContent(`Barcode ${CODE}`);
      seen.push(first.getAttribute("data-barcode-result")!);
    };
    record();
    lookups.hold = true;
    fireEvent.click(buttonIn("Scan again"));
    await waitFor(() => expect(scanner()).not.toBeNull());
    camera.reads = [{ text: CODE, format: undefined }];
    await waitFor(() => expect(lookups.sent).toEqual([CODE, CODE]));
    record();
    expect(within(first).getByRole("button", { name: "Looking up…" })).toHaveAttribute("aria-busy", "true");
    await waitFor(() => expect(document.activeElement).toBe(first));
    await releaseLookups();
    await waitFor(() => expect(first).toHaveAttribute("data-barcode-result", "not_found"));
    record();
    expect(seen).toEqual(["not_found", "pending", "not_found"]);
    expect(document.activeElement).toBe(first);
  });
});

describe("the label form after a miss", () => {
  it("Add it from the label after a miss on an 8-digit Lidl code opens the form with that barcode", async () => {
    renderSheet();
    await missOn(LIDL, "not_found");
    fireEvent.click(buttonIn("Add it from the label"));
    const sheet = await waitFor(() => ownSheet()!);
    expect((within(sheet).getByLabelText("Barcode (optional)") as HTMLInputElement).value).toBe(LIDL);
  });

  it("offers no way to the form with digits no barcode has", async () => {
    camera = installCamera();
    answerWith(WRONG, { result: "wrong_digits", barcode: WRONG });
    renderSheet();
    await missOn(WRONG, "wrong_digits");
    expect(block()).toHaveTextContent("No barcode has these digits. Check them against the pack.");
    expect(buttonsIn()).toEqual(["Search by name", "Scan again"]);
    // Neither way opens the form: Scan again opens the scanner, Search by name the search.
    fireEvent.click(buttonIn("Scan again"));
    await waitFor(() => expect(scanner()).not.toBeNull());
    expect(ownSheet()).toBeNull();
    fireEvent.keyDown(scanner()!, { key: "Escape" });
    await waitFor(() => expect(scanner()).toBeNull());
    fireEvent.click(buttonIn("Search by name"));
    expect(ownSheet()).toBeNull();
    expect(field().value).toBe("");
  });
});
