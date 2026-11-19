import { TEST_USER } from "@/__tests__/helpers/auth";
import { setTestLocale } from "@/__tests__/helpers/locale";
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

  it("writes the figures in the device's language, with a decimal comma on a Finnish device", () => {
    setTestLocale("fi-FI");
    renderRow(fineliFood("Rahka", { per100g: { energyKcal: 59.31, proteinG: 12, carbsG: 3.6, fatG: 0.2 } }));
    expect(screen.getByText(/kcal/).textContent).toBe("59 kcal · 12,0 g protein per 100 g");
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

  it("leaves Yours off an own food in a list of the user's own foods alone, and keeps the star", () => {
    const client = registerTestQueryClient(createTestQueryClient());
    const food = ownFood("Rye bread", { isFavourite: true });
    const view = render(
      <ul>
        <FoodRow food={food} onOpen={jest.fn()} />
        <FoodRow food={{ ...food, id: "other" }} onOpen={jest.fn()} ownMark={false} busy />
      </ul>,
      { wrapper: queryWrapper(client) },
    );
    const [marked, plain] = view.container.querySelectorAll<HTMLElement>("[data-food-row-marks]");
    expect(marked).toHaveTextContent("Yours");
    expect(plain).not.toHaveTextContent("Yours");
    expect(plain).toHaveTextContent("Favourite");
    const [first, second] = screen.getAllByRole("button");
    expect(first).not.toHaveAttribute("aria-busy");
    expect(second).toHaveAttribute("aria-busy", "true");
  });

  it("shows a busy row on screen with a ring in the star's slot, the slot the same, the star still named", () => {
    const client = registerTestQueryClient(createTestQueryClient());
    const food = ownFood("Rye bread", { isFavourite: true });
    const view = render(
      <ul>
        <FoodRow food={food} onOpen={jest.fn()} />
        <FoodRow food={{ ...food, id: "other" }} onOpen={jest.fn()} busy />
      </ul>,
      { wrapper: queryWrapper(client) },
    );
    const [idle, busy] = view.container.querySelectorAll<HTMLElement>("[data-food-row-marks]");
    expect(idle.querySelector("[data-row-busy]")).toBeNull();
    const ring = busy.querySelector<HTMLElement>("[data-row-busy]")!;
    expect(ring.getAttribute("aria-hidden")).toBe("true");
    expect(ring.className.split(" ")).toEqual(expect.arrayContaining(["animate-spin", "absolute", "inset-0"]));
    // The ring sits inside the star's slot, which keeps its classes, so nothing in the row moves.
    expect(ring.parentElement!.className).toBe(idle.firstElementChild!.className);
    expect(busy).toHaveTextContent("Favourite");
    const [, busyButton] = screen.getAllByRole("button");
    expect(busyButton.className.split(" ")).toContain("bg-surface-raised");
  });

  it("says what a press does only when the list passes it", () => {
    const client = registerTestQueryClient(createTestQueryClient());
    const food = ownFood("Rye bread");
    render(
      <ul>
        <FoodRow food={food} onOpen={jest.fn()} />
        <FoodRow food={{ ...food, id: "other" }} onOpen={jest.fn()} description="Opens it to edit." />
      </ul>,
      { wrapper: queryWrapper(client) },
    );
    const [plain, described] = screen.getAllByRole("button");
    expect(plain).not.toHaveAttribute("aria-description");
    expect(described).toHaveAttribute("aria-description", "Opens it to edit.");
  });
});
