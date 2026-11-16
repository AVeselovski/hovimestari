import { render, screen } from "@testing-library/react";
import { FoodDataSection } from "../_components/FoodDataSection";

describe("Settings, Food data", () => {
  it("credits Fineli and THL under CC BY 4.0, states the conversion, and disclaims endorsement", () => {
    render(<FoodDataSection />);
    const section = screen.getByRole("region", { name: "Food data" });
    expect(section).toHaveTextContent(
      "Food composition data comes from Fineli, the Finnish food composition database of the Finnish Institute for Health and Welfare (THL). It is used under the Creative Commons Attribution 4.0 licence. Hovimestari converts its energy values from kilojoules to kilocalories. Hovimestari is not produced or endorsed by THL.",
    );
    expect(screen.getByRole("link", { name: "Fineli" })).toHaveAttribute("href", "https://fineli.fi/");
    expect(screen.getByRole("link", { name: "Creative Commons Attribution 4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
  });

  it("is the anchor a Fineli food's detail links to", () => {
    render(<FoodDataSection />);
    expect(document.getElementById("food-data")).toContainElement(screen.getByRole("heading", { name: "Food data" }));
  });
});
