import { foodSourceRow } from "@/components/ui/styles";
import type { FoodSource } from "@hovimestari/types";
import { render, within } from "@testing-library/react";
import { FoodSourceLine } from "../FoodSourceLine";

// ---------------------------------------------------------------------------
// Where a food's figures come from. Every source gets the same row element
// with the same class, whose least height is a link's 44 px, so an own food's
// line stands where a Fineli food's does and the figures under it start at
// the same place. jsdom lays nothing out, so this pins the structure that
// keeps the place. The heights themselves are measured in a real browser.
// ---------------------------------------------------------------------------

const tokens = (el: Element) => el.className.split(/\s+/);

function row(source: FoodSource, barcode: string | null = null): HTMLElement {
  const { container } = render(<FoodSourceLine source={source} barcode={barcode} onLeave={jest.fn()} />);
  return container.firstElementChild as HTMLElement;
}

describe("FoodSourceLine", () => {
  it("is the same row element with the same class for an own, a Fineli and an Open Food Facts food", () => {
    const rows = [row("user"), row("fineli"), row("open_food_facts", "6408430000258")];
    for (const r of rows) {
      expect(r.tagName).toBe("P");
      expect(r.className).toBe(rows[0].className);
      expect(tokens(r)).toEqual(expect.arrayContaining(["flex", "min-h-11", "items-center"]));
    }
    expect(rows[0].className).toBe(foodSourceRow);
    // The words are as tall as a link, so when the row wraps on a narrow
    // phone they keep the height they have on one line.
    const labels = rows.map((r) => r.firstElementChild!);
    for (const l of labels) expect(tokens(l)).toEqual(expect.arrayContaining(["min-h-11", "items-center"]));
  });

  it("says My food on an own food, with no link", () => {
    const r = row("user");
    expect(r).toHaveTextContent(/^My food$/);
    expect(within(r).queryByRole("link")).toBeNull();
  });

  it("links a Fineli food to the credit for the food data", () => {
    const r = row("fineli");
    expect(r).toHaveTextContent(/^From FineliAbout the data$/);
    expect(
      within(r)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["About the data"]);
    expect(within(r).getByRole("link", { name: "About the data" })).toHaveAttribute("href", "/settings#food-data");
  });

  it("makes the words Open Food Facts the link to the product's page, in a new tab, once the barcode is known", () => {
    const r = row("open_food_facts", "6408430000258");
    expect(r).toHaveTextContent(/^From Open Food Facts.*About the data$/);
    const page = within(r).getByRole("link", { name: "Open Food Facts, this product's page (opens in a new tab)" });
    // The words on screen are the start of the name a screen reader says.
    expect(page.firstChild!.textContent).toBe("Open Food Facts");
    expect(page).toHaveAttribute("href", "https://world.openfoodfacts.org/product/6408430000258");
    expect(page).toHaveAttribute("target", "_blank");
    expect(
      within(r)
        .getAllByRole("link")
        .map((a) => a.getAttribute("href")),
    ).toEqual(["https://world.openfoodfacts.org/product/6408430000258", "/settings#food-data"]);
  });

  it("says From Open Food Facts as plain words until the barcode is known", () => {
    const r = row("open_food_facts");
    expect(r).toHaveTextContent(/^From Open Food FactsAbout the data$/);
    expect(
      within(r)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["About the data"]);
  });
});
