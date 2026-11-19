import { render, screen } from "@testing-library/react";
import { FoodDataSection } from "../_components/FoodDataSection";

/** What the eye reads: the text without the phrases only a screen reader hears. */
function visibleText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll(".sr-only").forEach((n) => n.remove());
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

const NEW_TAB = " (opens in a new tab)";

describe("Settings, Food data", () => {
  it("credits Fineli and THL under CC BY 4.0, states the conversion, and disclaims endorsement", () => {
    render(<FoodDataSection />);
    const section = screen.getByRole("region", { name: "Food data" });
    expect(visibleText(section)).toContain(
      "Food composition data comes from Fineli, the Finnish food composition database of the Finnish Institute for Health and Welfare (THL). It is used under the Creative Commons Attribution 4.0 licence. Hovimestari converts its energy values from kilojoules to kilocalories. Hovimestari is not produced or endorsed by THL.",
    );
    expect(screen.getByRole("link", { name: `Fineli${NEW_TAB}` })).toHaveAttribute("href", "https://fineli.fi/");
    expect(screen.getByRole("link", { name: `Creative Commons Attribution 4.0${NEW_TAB}` })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });

  it("credits Open Food Facts under the Open Database License, with both links, and disclaims endorsement", () => {
    render(<FoodDataSection />);
    const off = screen.getByRole("link", { name: `Open Food Facts${NEW_TAB}` });
    expect(visibleText(off.closest("p")!)).toBe(
      "Product data comes from Open Food Facts, available under the Open Database License. Hovimestari is not produced or endorsed by Open Food Facts.",
    );
    expect(off).toHaveAttribute("href", "https://openfoodfacts.org");
    const licence = screen.getByRole("link", { name: `Open Database License${NEW_TAB}` });
    expect(licence).toHaveAttribute("href", "https://opendatacommons.org/licenses/odbl/1-0/");
    expect(licence).toHaveAttribute("target", "_blank");
    expect(licence).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("says of every link that it opens a new tab", () => {
    render(<FoodDataSection />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.querySelector(".sr-only")).toHaveTextContent("(opens in a new tab)");
    }
  });

  it("is the anchor a Fineli or Open Food Facts food's detail links to", () => {
    render(<FoodDataSection />);
    expect(document.getElementById("food-data")).toContainElement(screen.getByRole("heading", { name: "Food data" }));
  });
});
