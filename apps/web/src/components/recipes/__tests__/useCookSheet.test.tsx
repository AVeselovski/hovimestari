import { fakeAuth } from "@/__tests__/helpers/auth";
import { clockFrom } from "@/__tests__/helpers/clock";
import { deferred } from "@/__tests__/helpers/queryClient";
import { TODAY } from "@/components/day/__tests__/support";
import { useAuth } from "@/contexts/AuthContext";
import { getRecipe } from "@/lib/api/recipes";
import type { Recipe } from "@hovimestari/types";
import { act, renderHook } from "@testing-library/react";
import { useCookSheet, type CookSheetOptions } from "../useCookSheet";
import { shakshuka } from "./recipeFixtures";
import { refusedAt } from "./recipeServer";

// ---------------------------------------------------------------------------
// useCookSheet on its own: what a recipe read that answers late may still
// do. Whether the sheet opens is asked of the host when the answer arrives,
// a later press takes the place of an earlier one, and a host that is gone
// hears nothing. The three hosts are driven in CookSheet.ways.test.tsx.
// ---------------------------------------------------------------------------

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/contexts/AuthContext");
jest.mock("@/lib/api/recipes", () => ({ getRecipe: jest.fn() }));

const actions = { logCook: jest.fn(), holding: false };
let recipe: Recipe;
let opener: HTMLButtonElement;

beforeEach(() => {
  clockFrom(`${TODAY}T12:00:00Z`);
  jest.mocked(useAuth).mockReturnValue(fakeAuth("authenticated"));
  recipe = shakshuka();
  opener = document.createElement("button");
});
afterEach(() => jest.restoreAllMocks());

function mount(options: Partial<CookSheetOptions> = {}) {
  const onReadFailed = jest.fn();
  const mayOpen = jest.fn(() => true);
  const hook = renderHook(() => useCookSheet(actions, { onReadFailed, mayOpen, ...options }));
  const press = () => act(() => hook.result.current.open(opener, { recipeId: recipe.id, day: TODAY }));
  return { ...hook, onReadFailed, mayOpen, press };
}

const tick = () => act(() => new Promise((r) => setTimeout(r, 10)));

describe("useCookSheet", () => {
  it("opens on the answer when the host says it still may, and is busy until then", async () => {
    const held = deferred<Recipe>();
    jest.mocked(getRecipe).mockReturnValue(held.promise);
    const { result, press, mayOpen } = mount();
    press();
    expect(result.current.reading).toBe(true);
    expect(result.current.isOpen).toBe(false);
    await act(async () => held.resolve(recipe));
    await tick();
    expect(mayOpen).toHaveBeenCalledWith({ recipeId: recipe.id, day: TODAY });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.reading).toBe(false);
  });

  it("opens nothing, and is no longer busy, when the host says it may not by the time the answer arrives", async () => {
    const held = deferred<Recipe>();
    jest.mocked(getRecipe).mockReturnValue(held.promise);
    let may = true;
    const { result, press, onReadFailed } = mount({ mayOpen: () => may });
    press();
    may = false;
    await act(async () => held.resolve(recipe));
    await tick();
    expect(result.current.isOpen).toBe(false);
    expect(result.current.sheet).toBeNull();
    expect(result.current.reading).toBe(false);
    expect(onReadFailed).not.toHaveBeenCalled();
  });

  it("says a failed read to the host that may still open, and not to one that has moved on", async () => {
    let may = true;
    const { press, onReadFailed } = mount({ mayOpen: () => may });
    jest.mocked(getRecipe).mockRejectedValueOnce(refusedAt(404, "recipe_not_found"));
    press();
    await tick();
    expect(onReadFailed).toHaveBeenCalledTimes(1);
    expect(onReadFailed.mock.calls[0][0]).toBe("This recipe is no longer available.");
    jest.mocked(getRecipe).mockRejectedValueOnce(refusedAt(404, "recipe_not_found"));
    press();
    may = false;
    await tick();
    expect(onReadFailed).toHaveBeenCalledTimes(1);
  });

  it("asks nothing of a host that is gone when the answer arrives, and tells it of no failure", async () => {
    const held = deferred<Recipe>();
    jest.mocked(getRecipe).mockReturnValue(held.promise);
    const first = mount();
    first.press();
    first.unmount();
    await act(async () => held.resolve(recipe));
    await tick();
    expect(first.mayOpen).not.toHaveBeenCalled();

    const failing = deferred<Recipe>();
    jest.mocked(getRecipe).mockReturnValue(failing.promise);
    const second = mount();
    second.press();
    second.unmount();
    await act(async () => failing.reject(refusedAt(500, "internal")));
    await tick();
    expect(second.onReadFailed).not.toHaveBeenCalled();
    expect(second.mayOpen).not.toHaveBeenCalled();
  });
});
