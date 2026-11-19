import { createTestQueryClient, queryWrapper } from "@/__tests__/helpers/queryClient";
import { refusal } from "@/components/foods/__tests__/support";
import { setSavedMealArchived } from "@/lib/api/savedMeals";
import type { SavedMeal } from "@hovimestari/types";
import { act, renderHook } from "@testing-library/react";
import { useMealActions, type ArchiveOutcome } from "../useMealActions";

// The archive and restore every host shares, on its own: the answer it gives
// each press, and the last guard against a write while writes wait.

jest.mock("@/lib/api/savedMeals", () => ({ setSavedMealArchived: jest.fn() }));

const bowl: SavedMeal = {
  id: "11111111-1111-4111-9111-111111111111",
  name: "Chicken bowl",
  source: "Wolt",
  figures: { energyKcal: 640, proteinG: 42, carbsG: 61, fatG: 22.5 },
  archived: false,
  lastCount: 1,
};

beforeEach(() => jest.mocked(setSavedMealArchived).mockReset());

function renderActions(held: boolean) {
  const onGone = jest.fn();
  const view = renderHook(({ held: h }) => useMealActions({ held: h, onGone }), {
    initialProps: { held },
    wrapper: queryWrapper(createTestQueryClient()),
  });
  return { ...view, onGone };
}

async function press(
  result: { current: ReturnType<typeof useMealActions> },
  archived: boolean,
): Promise<ArchiveOutcome> {
  let outcome!: ArchiveOutcome;
  await act(async () => {
    outcome = await result.current.setArchived(bowl, archived);
  });
  return outcome;
}

describe("useMealActions", () => {
  it("sends nothing and shows nothing while writes wait", async () => {
    const { result } = renderActions(true);
    expect(await press(result, true)).toEqual({ ok: false, failure: null });
    expect(setSavedMealArchived).not.toHaveBeenCalled();
  });

  it("answers the meal as it now is", async () => {
    jest.mocked(setSavedMealArchived).mockResolvedValue(undefined);
    const { result } = renderActions(false);
    expect(await press(result, true)).toEqual({ ok: true, meal: { ...bowl, archived: true } });
    expect(setSavedMealArchived).toHaveBeenCalledWith(bowl.id, true);
    expect(result.current.busyId).toBeNull();
  });

  it("answers a failure's line for the caller to show", async () => {
    jest.mocked(setSavedMealArchived).mockRejectedValue(refusal(500, "internal"));
    const { result, onGone } = renderActions(false);
    const outcome = await press(result, true);
    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? null : outcome.failure).toEqual(expect.any(String));
    expect(onGone).not.toHaveBeenCalled();
  });

  it("hands a meal that is gone to onGone, with no line", async () => {
    jest.mocked(setSavedMealArchived).mockRejectedValue(refusal(404, "saved_meal_not_found"));
    const { result, onGone } = renderActions(false);
    expect(await press(result, true)).toEqual({ ok: false, failure: null });
    expect(onGone).toHaveBeenCalledWith(bowl.id);
  });
});
