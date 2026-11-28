import type { FoodDetail, Portion } from "@hovimestari/types";
import { MAX_NEW_FOOD_PORTIONS } from "@hovimestari/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { CopyToOwnButton } from "../CopyToOwnButton";
import { copyStartOf, isCopyable, parseOwnFood, startOf, type CopyableFood } from "../ownFoodForm";
import { detailOf, fineliFood, fineliPortion, offFood, ownFood, ownPortion } from "./support";

// Copy to my foods: the one button, which food shows it and how it reads,
// and the start it builds for the own-food form (`copyStartOf`).

const CODE = "6416710030208";
/** `food`, which the button would copy: from Fineli or Open Food Facts. */
function copyable(food: FoodDetail): CopyableFood {
  if (!isCopyable(food)) throw new Error(`${food.name} is the user's own`);
  return food;
}

const label = (p: Portion) => (p.unit === "RKL" ? "Tablespoon" : p.unit === "TL" ? "Teaspoon" : (p.name ?? ""));

describe("copyStartOf", () => {
  it("names a Fineli measure by its label and an own portion by its name, listed by name, marked as Fineli's", () => {
    const food = detailOf(fineliFood("Oliiviöljy"), {
      portions: [fineliPortion("RKL", 13.5), fineliPortion("TL", 4.5), ownPortion("Lorautus", 8)],
    });
    const start = copyStartOf(copyable(food), label);
    expect(start).toEqual({
      name: "Oliiviöljy",
      barcode: undefined,
      per100g: food.per100g,
      from: "fineli",
      copied: true,
      portions: [
        { name: "Lorautus", grams: 8 },
        { name: "Tablespoon", grams: 13.5 },
        { name: "Teaspoon", grams: 4.5 },
      ],
    });
  });

  it("lists the portions in the server's Finnish order of names, the order the saved food lists them", () => {
    const names = ["Öljylasi", "Ämpäri", "Zeta", "annos", "Åsa", "Annos"];
    const food = detailOf(fineliFood("Oliiviöljy"), { portions: names.map((n, i) => ownPortion(n, i + 1)) });
    const portions = copyStartOf(copyable(food), label).portions!;
    // Finnish puts Å, Ä and Ö after Z, and ICU puts a lower-case name before its capitalised twin.
    expect(portions.map((p) => p.name)).toEqual(["annos", "Annos", "Zeta", "Åsa", "Ämpäri", "Öljylasi"]);
  });

  it("leaves out a Fineli measure the catalog cannot name", () => {
    const food = detailOf(fineliFood("Oliiviöljy"), {
      portions: [fineliPortion("XYZ" as Portion["unit"] & string, 10), fineliPortion("RKL", 13.5)],
    });
    expect(copyStartOf(copyable(food), label).portions).toEqual([{ name: "Tablespoon", grams: 13.5 }]);
  });

  it("keeps an Open Food Facts food's barcode and marks it as the product's", () => {
    const start = copyStartOf(copyable(offFood("Filos ladolia", CODE)), label);
    expect(start.barcode).toBe(CODE);
    expect(start.from).toBe("open_food_facts");
  });

  it("keeps at most the portions a new food may come with, the first in the detail's order, and leaves out one the server would refuse", () => {
    const many = Array.from({ length: MAX_NEW_FOOD_PORTIONS + 5 }, (_, i) => ownPortion(`P${i}`, i + 1));
    const food = detailOf(fineliFood("Iso"), { portions: [fineliPortion("DL", 0), ...many] });
    const portions = copyStartOf(copyable(food), label).portions!;
    expect(portions).toHaveLength(MAX_NEW_FOOD_PORTIONS);
    // P0 to P29 are kept, the refused DL and the five past the cap are not, whatever order they are listed in.
    expect(portions.map((p) => p.name).sort()).toEqual(
      many
        .slice(0, MAX_NEW_FOOD_PORTIONS)
        .map((p) => p.name)
        .sort(),
    );
  });

  it("saves values with three decimals untouched, as stored", () => {
    const food = detailOf(
      fineliFood("Oliiviöljy", { per100g: { energyKcal: 899.61, proteinG: 0.125, carbsG: 0, fatG: 99.875 } }),
    );
    const baseline = startOf(copyStartOf(copyable(food), label));
    const parsed = parseOwnFood(baseline.values, baseline);
    expect(parsed).toEqual({ ok: true, body: { name: "Oliiviöljy", per100g: food.per100g, barcode: null } });
  });
});

describe("CopyToOwnButton", () => {
  const open = jest.fn();
  const button = () => screen.queryByRole("button", { name: /^Copy to my foods/ });

  beforeEach(() => open.mockReset());

  it.each([
    ["a Fineli food", detailOf(fineliFood("Oliiviöljy"))],
    ["an Open Food Facts food", offFood("Filos ladolia", CODE)],
  ])("shows on %s as it opens, waits for its detail, then opens the form on its start", (_what, food: FoodDetail) => {
    const { rerender } = render(
      <CopyToOwnButton source={food.source} unavailable={false} detail={undefined} copy={{ carried: null, open }} />,
    );
    // In its place from the start, so nothing under it moves as the detail lands. A press waits.
    const waiting = button()!;
    expect(waiting).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(waiting);
    expect(open).not.toHaveBeenCalled();
    rerender(<CopyToOwnButton source={food.source} unavailable={false} detail={food} copy={{ carried: null, open }} />);
    expect(button()).toBe(waiting);
    expect(button()).not.toHaveAttribute("aria-disabled");
    expect(button()).toHaveTextContent(/^Copy to my foods$/);
    fireEvent.click(button()!);
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ name: food.name, per100g: food.per100g }), button());
  });

  it("does not show once its detail could not be read, and shows again when it is", () => {
    const food = detailOf(fineliFood("Oliiviöljy"));
    const { rerender } = render(
      <CopyToOwnButton source={food.source} unavailable detail={undefined} copy={{ carried: null, open }} />,
    );
    expect(button()).toBeNull();
    rerender(<CopyToOwnButton source={food.source} unavailable={false} detail={food} copy={{ carried: null, open }} />);
    expect(button()).not.toHaveAttribute("aria-disabled");
  });

  it("says it takes the barcode while one is carried", () => {
    const food = detailOf(fineliFood("Oliiviöljy"));
    render(<CopyToOwnButton source={food.source} unavailable={false} detail={food} copy={{ carried: CODE, open }} />);
    expect(button()).toHaveTextContent(/^Copy to my foods with the barcode$/);
  });

  it("never shows on an own food, before or after its detail", () => {
    const food = detailOf(ownFood("Oma öljy"));
    const { rerender } = render(
      <CopyToOwnButton source={food.source} unavailable={false} detail={undefined} copy={{ carried: CODE, open }} />,
    );
    expect(button()).toBeNull();
    rerender(<CopyToOwnButton source={food.source} unavailable={false} detail={food} copy={{ carried: CODE, open }} />);
    expect(button()).toBeNull();
  });
});
