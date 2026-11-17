import { TEST_USER } from "@/__tests__/helpers/auth";
import { createTestQueryClient, queryWrapper, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import type { FoodNameLanguage, FoodSummary } from "@hovimestari/types";
import { render, screen } from "@testing-library/react";
import { FoodRow } from "../FoodRow";
import { fineliFood, ownFood } from "./support";

function renderRow(food: FoodSummary, language: FoodNameLanguage | null = "fi") {
  const client = registerTestQueryClient(createTestQueryClient());
  if (language) client.setQueryData(queryKeys.me(), { ...TEST_USER, foodNameLanguage: language });
  const view = render(
    <ul>
      <FoodRow food={food} onOpen={jest.fn()} />
    </ul>,
    { wrapper: queryWrapper(client) },
  );
  const marks = () => view.container.querySelector<HTMLElement>("[data-food-row-marks]")!;
  return { ...view, marks };
}

describe("FoodRow", () => {
  it("names the language of each name, so a long one hyphenates by its own rules", () => {
    const food = fineliFood("Rahka, maustamaton", { otherName: "Quark, plain" });
    renderRow(food, "fi");
    expect(screen.getByText("Rahka, maustamaton")).toHaveAttribute("lang", "fi");
    expect(screen.getByText("Quark, plain")).toHaveAttribute("lang", "en");
    expect(screen.getByText("Rahka, maustamaton").className.split(" ")).toContain("hyphens-auto");
  });

  it("reads a Fineli name with no English one as Finnish for an English reader", () => {
    renderRow(fineliFood("Mämmi", { otherName: null }), "en");
    expect(screen.getByText("Mämmi")).toHaveAttribute("lang", "fi");
  });

  it("sets no language before the account is known", () => {
    renderRow(fineliFood("Mämmi"), null);
    expect(screen.getByText("Mämmi")).not.toHaveAttribute("lang");
  });

  it.each([
    ["a Fineli food", fineliFood("Rahka")],
    ["an own food", ownFood("Oma rahka")],
  ])("keeps the star's column for %s whether starred or not, so starring never narrows the name", (_n, food) => {
    const plain = renderRow({ ...food, isFavourite: false });
    const column = plain.marks().className;
    const slot = plain.marks().firstElementChild!.className.split(" ");
    expect(slot).toEqual(expect.arrayContaining(["size-5", "invisible"]));
    plain.unmount();
    const starred = renderRow({ ...food, isFavourite: true });
    // The same column and slot in both states: only the star inside the slot shows.
    expect(starred.marks().className).toBe(column);
    expect(starred.marks().firstElementChild!.className.split(" ")).toEqual(slot.filter((c) => c !== "invisible"));
    expect(screen.getByText("Favourite")).toBeInTheDocument();
  });

  it("shows the protein with one decimal always, joined to its unit", () => {
    renderRow(fineliFood("Rahka", { per100g: { energyKcal: 59.31, proteinG: 12, carbsG: 3.6, fatG: 0.2 } }));
    expect(screen.getByText(/kcal/).textContent).toBe("59 kcal · 12.0 g protein per 100 g");
  });

  it("shows a meta line in place of the figures, and puts a trailing control beside the row's button, not inside it", () => {
    const client = registerTestQueryClient(createTestQueryClient());
    const food = fineliFood("Rahka");
    render(
      <ul>
        <FoodRow food={food} onOpen={jest.fn()} meta="Last 250 g" trailing={<button type="button">Log again</button>} />
      </ul>,
      { wrapper: queryWrapper(client) },
    );
    const row = screen.getByRole("button", { name: /^Rahka/ });
    expect(row).toHaveTextContent("Last 250 g");
    expect(row).not.toHaveTextContent("per 100");
    const trailing = screen.getByRole("button", { name: "Log again" });
    expect(row.contains(trailing)).toBe(false);
    expect(trailing.parentElement).toBe(row.parentElement);
  });
});
