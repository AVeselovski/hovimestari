import { createFood, updateFood } from "@/lib/api/foods";
import type { FoodDetail } from "@hovimestari/types";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import messages from "../../../../messages/en.json";
import { OwnFoodSheet } from "../OwnFoodSheet";
import { copyStartOf, isCopyable, type OwnFoodStart } from "../ownFoodForm";
import { detailOf, fineliFood, offFood, ownFood } from "./support";

// The own-food form while the food search carries a barcode from a miss: a
// new food opens with it, an edit offers it by a button and never sends it
// unasked. And a start's portions: listed last, sent with the create only.

jest.mock("@/lib/api/foods", () => ({ createFood: jest.fn(), updateFood: jest.fn(), deleteFood: jest.fn() }));

const CODE = "6416710030208";
const OTHER = "6408430000258";
const mine = detailOf(ownFood("Oliiviöljy Filos", { per100g: { energyKcal: 828, proteinG: 0, carbsG: 0, fatG: 92 } }));

beforeEach(() => {
  jest
    .mocked(createFood)
    .mockReset()
    .mockResolvedValue(detailOf(ownFood("Saved")));
  jest
    .mocked(updateFood)
    .mockReset()
    .mockImplementation(async (_id, body) => ({ ...mine, ...body }));
});

const sheet = () => screen.getAllByRole("dialog")[0];
const input = (label: string) => within(sheet()).getByLabelText(label) as HTMLInputElement;
const useButton = () => within(sheet()).queryByRole("button", { name: /^Use barcode/ });
const save = () => fireEvent.click(within(sheet()).getByRole("button", { name: "Save food" }));

type Opened = { food: FoodDetail; start?: never } | { food?: undefined; start: OwnFoodStart };

function renderSheet(props: Opened & { carried?: string }): void {
  render(<OwnFoodSheet open returnFocusTo={null} onClose={jest.fn()} {...props} />);
}

describe("OwnFoodSheet, an edit while a barcode is carried", () => {
  it("opens with the field as saved and offers the code, which a press puts in the field", () => {
    renderSheet({ food: mine, carried: CODE });
    expect(input("Barcode (optional)").value).toBe("");
    expect(useButton()).toHaveTextContent(`Use barcode ${CODE}`);
    fireEvent.click(useButton()!);
    expect(input("Barcode (optional)").value).toBe(CODE);
    expect(useButton()).toBeNull();
    // The button went with the press, so focus stays with the barcode, in its field.
    expect(document.activeElement).toBe(input("Barcode (optional)"));
  });

  it("offers it over another barcode the food has, and again once the field moves off it", () => {
    renderSheet({ food: { ...mine, barcode: OTHER }, carried: CODE });
    expect(input("Barcode (optional)").value).toBe(OTHER);
    fireEvent.click(useButton()!);
    expect(input("Barcode (optional)").value).toBe(CODE);
    fireEvent.change(input("Barcode (optional)"), { target: { value: "641671003020" } });
    expect(useButton()).not.toBeNull();
  });

  it("never sends the carried code unasked: saved without the press, the barcode stays empty", async () => {
    renderSheet({ food: mine, carried: CODE });
    fireEvent.change(input("Protein"), { target: { value: "0.5" } });
    save();
    await waitFor(() => expect(updateFood).toHaveBeenCalledTimes(1));
    expect(jest.mocked(updateFood).mock.calls[0][1]).toEqual({
      name: mine.name,
      per100g: { ...mine.per100g, proteinG: 0.5 },
      barcode: null,
    });
  });

  it("offers nothing with nothing carried", () => {
    renderSheet({ food: mine });
    expect(useButton()).toBeNull();
  });
});

describe("OwnFoodSheet, a new food while a barcode is carried", () => {
  it("opens with the carried code over the start's own, and offers it only once the field moves off it", () => {
    renderSheet({ start: { name: "Filos", barcode: OTHER }, carried: CODE });
    expect(input("Barcode (optional)").value).toBe(CODE);
    expect(useButton()).toBeNull();
    fireEvent.change(input("Barcode (optional)"), { target: { value: "" } });
    expect(useButton()).toHaveTextContent(`Use barcode ${CODE}`);
  });
});

describe("OwnFoodSheet, a start's portions", () => {
  const start = {
    name: "Oliiviöljy",
    per100g: { energyKcal: 899.6, proteinG: 0, carbsG: 0, fatG: 99.875 },
    from: "fineli" as const,
    portions: [
      { name: "Tablespoon", grams: 13.5 },
      { name: "Teaspoon", grams: 4.5 },
    ],
  };

  it("lists them last, read-only, and sends them with the create, the untouched values as stored", async () => {
    renderSheet({ start });
    const list = within(sheet()).getByRole("region", { name: "Portions" });
    expect(list).toHaveTextContent("They come with the food. Change them once it is saved.");
    expect(within(list).queryByRole("button")).toBeNull();
    expect(within(list).queryByRole("textbox")).toBeNull();
    // The last part of the form.
    const form = sheet().querySelector("form")!;
    expect(form.lastElementChild).toContainElement(list);
    expect(sheet()).toHaveTextContent("These values are Fineli's. Change any that differ from the label.");
    save();
    await waitFor(() =>
      expect(createFood).toHaveBeenCalledWith({
        name: "Oliiviöljy",
        per100g: start.per100g,
        barcode: null,
        portions: start.portions,
      }),
    );
  });

  it("sends no portions key for a start without any", async () => {
    renderSheet({ start: { name: "Filos", per100g: start.per100g } });
    expect(within(sheet()).queryByRole("region", { name: "Portions" })).toBeNull();
    save();
    await waitFor(() => expect(createFood).toHaveBeenCalledTimes(1));
    expect(jest.mocked(createFood).mock.calls[0][0]).not.toHaveProperty("portions");
  });
});

describe("OwnFoodSheet, the lines under Per 100 g", () => {
  const copyOf = (food: FoodDetail): OwnFoodStart => {
    if (!isCopyable(food)) throw new Error("an own food is not copied");
    return copyStartOf(food, () => "");
  };
  const { hint, checkFineli, checkProduct } = messages.foods.ownFood;
  /** The lines under the values' title, and what the values' group is described by. */
  const lines = () => {
    const group = within(sheet()).getByRole("group", { name: /^Per 100\sg$/ });
    const ids = group.getAttribute("aria-describedby")!.split(" ");
    return { described: ids.map((id) => document.getElementById(id)!.textContent), shown: group.textContent! };
  };

  it("on a copy of a Fineli food, says only whose values they are", () => {
    renderSheet({ start: copyOf(detailOf(fineliFood("Oliiviöljy"))) });
    expect(lines().described).toEqual([checkFineli]);
    expect(lines().shown).not.toContain(hint);
  });

  it("on a copy of an Open Food Facts food, says only whose values they are", () => {
    renderSheet({ start: copyOf(offFood("Filos ladolia", CODE)) });
    expect(lines().described).toEqual([checkProduct]);
    expect(lines().shown).not.toContain(hint);
  });

  it("on a new food, asks to copy the values from the label", () => {
    renderSheet({ start: { name: "Filos" } });
    expect(lines().described).toEqual([hint]);
  });

  it("on a product a lookup brought back with values missing, asks for the label and says where the rest came from", () => {
    renderSheet({ start: { name: "Filos", barcode: CODE, per100g: { energyKcal: 828 }, from: "open_food_facts" } });
    expect(lines().described).toEqual([hint, checkProduct]);
  });
});
