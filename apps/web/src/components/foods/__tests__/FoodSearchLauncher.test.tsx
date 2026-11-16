import { getFavouriteFoods, getOwnFoods } from "@/lib/api/foods";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FoodSearchLauncher } from "../FoodSearchLauncher";

jest.mock("@/lib/api/foods", () => ({
  searchFoods: jest.fn(),
  getFavouriteFoods: jest.fn(),
  getOwnFoods: jest.fn(),
  getFood: jest.fn(),
}));

beforeEach(() => {
  jest.mocked(getFavouriteFoods).mockReset().mockResolvedValue({ foods: [] });
  jest.mocked(getOwnFoods).mockReset().mockResolvedValue({ foods: [] });
});

describe("FoodSearchLauncher", () => {
  it("is a button named Search foods that opens the food sheet once, and takes focus back on close", async () => {
    render(<FoodSearchLauncher />);
    const launcher = screen.getByRole("button", { name: "Search foods" });
    expect(launcher).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(launcher);
    fireEvent.click(launcher);
    expect(screen.getAllByRole("dialog", { name: "Foods" })).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(launcher).toHaveFocus());
  });
});
