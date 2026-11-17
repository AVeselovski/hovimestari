import { createTestQueryClient, queryWrapper, registerTestQueryClient } from "@/__tests__/helpers/queryClient";
import { fireEvent, render, screen } from "@testing-library/react";
import { DayLauncher } from "../DayLauncher";

jest.mock("@/lib/api/log", () => ({ getRecents: jest.fn(() => new Promise(() => {})) }));
jest.mock("@/lib/api/savedMeals", () => ({
  getSavedMeals: jest.fn().mockResolvedValue({ meals: [] }),
  createSavedMeal: jest.fn(),
  saveAndLog: jest.fn(),
  updateSavedMeal: jest.fn(),
  setSavedMealArchived: jest.fn(),
  deleteSavedMeal: jest.fn(),
}));
jest.mock("@/lib/api/foods", () => ({
  getFood: jest.fn(),
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(() => new Promise(() => {})),
  getOwnFoods: jest.fn(() => new Promise(() => {})),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));

function renderLauncher(props: Partial<Parameters<typeof DayLauncher>[0]> = {}) {
  const client = registerTestQueryClient(createTestQueryClient());
  return render(
    <DayLauncher
      date="2026-11-16"
      future={false}
      actions={{ add: jest.fn(), saveAndLog: jest.fn(), withdrawAdd: jest.fn(), holding: false }}
      {...props}
    />,
    { wrapper: queryWrapper(client) },
  );
}

describe("DayLauncher", () => {
  it("reads Log food on today and past days and Add to plan on a future day", () => {
    const { rerender } = renderLauncher();
    expect(screen.getByRole("button", { name: "Log food" })).toBeInTheDocument();
    rerender(
      <DayLauncher
        date="2026-11-18"
        future
        actions={{ add: jest.fn(), saveAndLog: jest.fn(), withdrawAdd: jest.fn(), holding: false }}
      />,
    );
    expect(screen.getByRole("button", { name: "Add to plan" })).toBeInTheDocument();
  });

  it("opens the log sheet once on a double tap", () => {
    renderLauncher();
    const launcher = screen.getByRole("button", { name: "Log food" });
    fireEvent.click(launcher);
    fireEvent.click(launcher);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("opens nothing while the app asks for today, or while no date is known", () => {
    const { rerender } = renderLauncher({
      actions: { add: jest.fn(), saveAndLog: jest.fn(), withdrawAdd: jest.fn(), holding: true },
    });
    const launcher = screen.getByRole("button", { name: "Log food" });
    expect(launcher).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(launcher);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(
      <DayLauncher
        date={null}
        future={false}
        actions={{ add: jest.fn(), saveAndLog: jest.fn(), withdrawAdd: jest.fn(), holding: false }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Log food" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
