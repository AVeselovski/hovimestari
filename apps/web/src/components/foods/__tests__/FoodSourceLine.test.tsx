import { foodSourceRow } from "@/components/ui/styles";
import type { FoodSource } from "@hovimestari/types";
import { render, screen, within } from "@testing-library/react";
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
    expect(within(r).getByText("From Fineli")).toBeInTheDocument();
    expect(
      within(r)
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual(["About the food data"]);
  });

  it("links an Open Food Facts food to its own page and to the credit", () => {
    const r = row("open_food_facts", "6408430000258");
    expect(within(r).getByText("From Open Food Facts")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});
