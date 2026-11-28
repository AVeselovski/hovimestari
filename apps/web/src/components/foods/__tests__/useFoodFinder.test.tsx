import { BottomSheet } from "@/components/ui/BottomSheet";
import { createFood, lookupBarcode, searchFoods } from "@/lib/api/foods";
import type { FoodDetail, FoodSummary, LastAmount } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef, useState, type ReactElement } from "react";
import { useFoodFinder, type FoodFinder } from "../useFoodFinder";
import { installLookups, keepProduct } from "./barcodeServer";
import { installServer, quarks, settle } from "./foodSheetServer";
import { detailOf, offFood, ownFood } from "./support";

// The food search as a hook, through a host that puts its three slots where
// a sheet puts them: the field in the header, the results in the body, the
// stacked sheets in `stacked`. The host logs nothing, so whatever the log
// sheet adds around the search is absent here by construction.

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
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

interface Calls {
  picked: Array<{ food: FoodSummary; last: LastAmount | null | undefined }>;
  saved: Array<{ food: FoodDetail; row: string | null }>;
  finder: FoodFinder | null;
}

function Host({ calls }: { calls: Calls }): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const finder = useFoodFinder({
    open: true,
    canPick: true,
    inputRef,
    contentRef,
    say: setNote,
    onPick: (food, _row, last) => calls.picked.push({ food, last }),
    onSavedOwnFood: (food, row) => calls.saved.push({ food, row }),
    onOwnFoodDeleted: jest.fn(),
    onFoodGone: jest.fn(),
    label: "Search foods",
  });
  calls.finder = finder;
  return (
    <BottomSheet
      open
      onClose={jest.fn()}
      ariaLabel="Finder host"
      header={
        <div>
          <p data-note="">{note}</p>
          {finder.field}
        </div>
      }
      size="tall"
      stacked={finder.stacked}
    >
      <div ref={contentRef}>{finder.results({ browse: <p data-browse="">Host browse</p>, notice: null })}</div>
    </BottomSheet>
  );
}

function renderHost(): Calls {
  const calls: Calls = { picked: [], saved: [], finder: null };
  render(<Host calls={calls} />);
  return calls;
}

const host = () => screen.getByRole("dialog", { name: "Finder host" });
const field = () => within(host()).getByLabelText("Search foods") as HTMLInputElement;
const type = (value: string) => fireEvent.change(field(), { target: { value } });
const browse = () => host().querySelector("[data-browse]");

beforeEach(() => {
  installServer();
  installLookups();
  jest.mocked(createFood).mockReset();
});

describe("useFoodFinder", () => {
  it("shows the host's browse while fewer than two characters are typed, and no log buttons", async () => {
    renderHost();
    expect(field().placeholder).toBe("Search foods");
    expect(browse()).not.toBeNull();
    type("r");
    await settle();
    expect(browse()).not.toBeNull();
    expect(searchFoods).not.toHaveBeenCalled();
    for (const name of [/^Log/, /^Add to plan/, /^New meal/, /^Add an estimate/]) {
      expect(within(host()).queryByRole("button", { name })).toBeNull();
    }
  });

  it("shows the food results after two characters, and a tap calls onPick with no last amount", async () => {
    const calls = renderHost();
    type("rahka");
    await settle();
    expect(browse()).toBeNull();
    fireEvent.click(await within(host()).findByRole("button", { name: /^Rahka, maustamaton/ }));
    expect(calls.picked.map((p) => p.food.id)).toEqual([quarks[1].id]);
    expect(calls.picked[0].last).toBeUndefined();
  });

  it("offers to add the text as an own food when nothing matches", async () => {
    renderHost();
    type("kaurajuoma");
    await settle();
    fireEvent.click(await within(host()).findByRole("button", { name: /Add .kaurajuoma. as your own food/ }));
    const own = await screen.findByRole("dialog", { name: "New food" });
    expect((within(own).getByLabelText("Name") as HTMLInputElement).value).toBe("kaurajuoma");
  });

  it("puts the barcode block in place of the lists for a code, and a found food calls onPick", async () => {
    const product = offFood("Maitorahka", CODE);
    keepProduct(CODE, product);
    const calls = renderHost();
    type(CODE);
    await settle();
    const block = host().querySelector<HTMLElement>("[data-barcode-result]")!;
    expect(block).not.toBeNull();
    expect(browse()).toBeNull();
    expect(searchFoods).not.toHaveBeenCalled();
    fireEvent.click(within(block).getByRole("button", { name: /^Look up/ }));
    await waitFor(() => expect(calls.picked.map((p) => p.food.id)).toEqual([product.id]));
    expect(lookupBarcode).toHaveBeenCalledTimes(1);
  });

  it("calls onSavedOwnFood with the food an own-food sheet saved", async () => {
    const saved = detailOf(ownFood("Kaurajuoma, oma"));
    jest.mocked(createFood).mockResolvedValue(saved);
    const calls = renderHost();
    type("kaurajuoma");
    await settle();
    fireEvent.click(await within(host()).findByRole("button", { name: /Add .kaurajuoma. as your own food/ }));
    const own = await screen.findByRole("dialog", { name: "New food" });
    for (const [label, value] of [
      ["Energy", "40"],
      ["Protein", "1"],
      ["Carbohydrates", "6"],
      ["Fat", "1,5"],
    ]) {
      fireEvent.change(within(own).getByLabelText(label), { target: { value } });
    }
    fireEvent.click(within(own).getByRole("button", { name: /^save food$/i }));
    await waitFor(() => expect(calls.saved.map((s) => s.food.id)).toEqual([saved.id]));
    expect(calls.saved[0].row).toBeNull();
  });

  it("empties the field on reset", async () => {
    const calls = renderHost();
    type("rahka");
    await settle();
    act(() => calls.finder!.reset());
    await settle();
    expect(field().value).toBe("");
    expect(browse()).not.toBeNull();
  });
});
