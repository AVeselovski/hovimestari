import { holdSheetExits, openSheet } from "@/__tests__/sheet";
import { DECODE_EVERY_MS } from "@/components/foods/scanner/useCameraStream";
import { lookupBarcode } from "@/lib/api/foods";
import { getSavedMeals } from "@/lib/api/savedMeals";
import type { FoodDetail } from "@hovimestari/types";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { installLookups, keepProduct, lookups } from "./barcodeServer";
import { body, dialog, field, installServer, renderSheet, type } from "./foodSheetServer";
import { everyTrackStopped, installCamera, type FakeCamera } from "./scannerFakes";
import { offFood } from "./support";

// The scanner in the log sheet: the camera button's place in the search
// field, what a read does to the field and the lookup, where focus goes on
// each way out, and the status line. The camera and the decoder are stubbed
// (scannerFakes.ts). ScannerSheet.test.tsx covers the scanner's own states.

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

const SCANNER = "Scan a barcode";
const EAN8 = "96385074";
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
  jest.useRealTimers();
});

const cameraButton = () => screen.queryByRole("button", { name: SCANNER });
const clearButton = () => screen.queryByRole("button", { name: "Clear the search" });
const scanner = () => openSheet(SCANNER);
const block = () => body().querySelector<HTMLElement>("[data-barcode-result]");
const statusLine = () => document.querySelector("[data-status-line]")?.textContent;
/** What each lookup sent: the code and the format, or null for none. */
const sent = () => jest.mocked(lookupBarcode).mock.calls.map(([code, format]) => [code, format ?? null]);

async function openScanner(): Promise<HTMLElement> {
  fireEvent.click(cameraButton()!);
  await waitFor(() => expect(scanner()).not.toBeNull());
  return scanner()!;
}

describe("the camera button", () => {
  it("is not there where the browser cannot ask for a camera, as on plain http", () => {
    renderSheet();
    expect(cameraButton()).toBeNull();
  });

  it("shares the field's end slot with the clear cross, so the field never changes", () => {
    camera = installCamera();
    renderSheet();
    const camButton = cameraButton()!;
    expect(camButton).not.toBeNull();
    expect(clearButton()).toBeNull();
    const fieldClass = field().className;
    // Typed: the cross in the same slot, the camera gone.
    type("rahka");
    expect(cameraButton()).toBeNull();
    const cross = clearButton()!;
    expect(cross.className.split(" ").sort()).toEqual(camButton.className.split(" ").sort());
    expect(field().className).toBe(fieldClass);
    // A 44 pixel target in both states.
    expect(cross.className.split(" ")).toContain("size-11");
    // Cleared: the camera again.
    fireEvent.click(cross);
    expect(cameraButton()).not.toBeNull();
    expect(field().className).toBe(fieldClass);
  });
});

describe("a read", () => {
  it("closes the scanner, types the code, sends one lookup with the format and focuses the block", async () => {
    jest.useFakeTimers();
    // The scanner slides out for 400 ms with focus still in it, as in a browser, so the block's
    // own rule for lost focus leaves it alone and the host must place it.
    restoreExits = holdSheetExits();
    camera = installCamera();
    renderSheet();
    lookups.hold = true;
    await openScanner();
    expect(sent()).toEqual([]);
    camera.reads = [{ text: EAN8, format: "ean_8" }];
    await waitFor(() => expect(scanner()).toBeNull());
    expect(field().value).toBe(EAN8);
    expect(sent()).toEqual([[EAN8, "ean_8"]]);
    expect(everyTrackStopped(camera)).toBe(true);
    // The camera button has become the cross, so focus goes to the result block, named by its code.
    expect(cameraButton()).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(block()));
    expect(block()).toHaveAccessibleName(`Barcode ${EAN8}`);
    expect(within(block()!).getByRole("button", { name: /Looking up/ })).toHaveAttribute("aria-busy", "true");
    // Still one lookup after many more turns of the decode loop's clock.
    await act(() => jest.advanceTimersByTimeAsync(DECODE_EVERY_MS * 10));
    expect(sent()).toEqual([[EAN8, "ean_8"]]);
  });

  it('says "Barcode read: {code}." on the status line for six seconds', async () => {
    jest.useFakeTimers();
    camera = installCamera();
    renderSheet();
    await openScanner();
    camera.reads = [{ text: "6408430000258", format: undefined }];
    await waitFor(() => expect(scanner()).toBeNull());
    expect(statusLine()).toBe("Barcode read: 6408430000258.");
    await act(async () => jest.advanceTimersByTime(5800));
    expect(statusLine()).toBe("Barcode read: 6408430000258.");
    await act(async () => jest.advanceTimersByTime(300));
    expect(statusLine()).not.toBe("Barcode read: 6408430000258.");
  });

  it("sends no format for an EAN-13, which reads one way", async () => {
    camera = installCamera();
    renderSheet();
    await openScanner();
    camera.reads = [{ text: "6408430000258", format: undefined }];
    await waitFor(() => expect(sent()).toEqual([["6408430000258", null]]));
  });

  it("opens a food found at once, as Look up does", async () => {
    camera = installCamera();
    const milk: FoodDetail = offFood("Eila laktoositon kevytmaitojuoma, Valio", "6408430000258");
    keepProduct("6408430000258", milk);
    renderSheet();
    await openScanner();
    camera.reads = [{ text: "6408430000258", format: undefined }];
    await waitFor(() => expect(within(dialog()).queryByRole("heading", { level: 2, name: milk.name })).not.toBeNull());
    expect(within(dialog()).getByRole("button", { name: "Back" })).toHaveFocus();
    expect(sent()).toEqual([["6408430000258", null]]);
  });

  it("does nothing for a code the field would not take: no lookup, the field untouched, the scanner open", async () => {
    jest.useFakeTimers();
    camera = installCamera();
    renderSheet();
    await openScanner();
    camera.reads = [{ text: "640843000025812", format: undefined }];
    await act(() => jest.advanceTimersByTimeAsync(DECODE_EVERY_MS * 4));
    expect(camera.decodes).toBeGreaterThan(2);
    expect(sent()).toEqual([]);
    expect(field().value).toBe("");
    expect(scanner()).not.toBeNull();
    expect(camera.streams[0].tracks.every((t) => t.readyState === "live")).toBe(true);
  });
});

describe("the other ways out", () => {
  it("Type the number closes the scanner, stops the camera and puts focus in the field, sending nothing", async () => {
    camera = installCamera();
    renderSheet();
    const sheet = await openScanner();
    await waitFor(() => expect(camera!.streams).toHaveLength(1));
    fireEvent.click(within(sheet).getByRole("button", { name: "Type the number" }));
    await waitFor(() => expect(scanner()).toBeNull());
    expect(everyTrackStopped(camera)).toBe(true);
    expect(document.activeElement).toBe(field());
    expect(sent()).toEqual([]);
  });

  it("Escape closes the scanner, stops the camera and gives focus back to the camera button", async () => {
    camera = installCamera();
    renderSheet();
    const sheet = await openScanner();
    await waitFor(() => expect(camera!.streams).toHaveLength(1));
    fireEvent.keyDown(sheet, { key: "Escape" });
    await waitFor(() => expect(scanner()).toBeNull());
    expect(everyTrackStopped(camera)).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(cameraButton()));
    // The log sheet is still open, on its lists.
    const logSheet = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(
      (d) => d.getAttribute("aria-label") === "Log food",
    );
    expect(logSheet).toHaveAttribute("data-open");
    expect(field().value).toBe("");
  });

  it("closes with the log sheet and stops the camera when the log sheet goes", async () => {
    camera = installCamera();
    const view = renderSheet();
    await openScanner();
    await waitFor(() => expect(camera!.streams).toHaveLength(1));
    view.unmount();
    expect(everyTrackStopped(camera)).toBe(true);
  });
});
