import { confirmArmed } from "@/__tests__/sheet";
import { refusal } from "@/components/foods/__tests__/support";
import { TodayContext } from "@/hooks/useToday";
import { createSavedMeal, deleteSavedMeal, updateSavedMeal } from "@/lib/api/savedMeals";
import type { SavedMeal } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SavedMealSheet, type MealSheetArchive } from "../SavedMealSheet";
import type { ArchiveOutcome } from "../useMealActions";

// The saved meal sheet without `logging`, as the Library mounts it: save
// only, Delete in the footer with its confirmation stacked on the sheet, and
// `archive`. The log sheet's own use of the sheet is in SavedMealSheet.test.tsx.

jest.mock("@/lib/api/savedMeals", () => ({
  createSavedMeal: jest.fn(),
  updateSavedMeal: jest.fn(),
  deleteSavedMeal: jest.fn(),
}));

const bowl: SavedMeal = {
  id: "11111111-1111-4111-9111-111111111111",
  name: "Chicken bowl",
  source: "Wolt",
  figures: { energyKcal: 640, proteinG: 42, carbsG: 61, fatG: 22.5 },
  archived: false,
  lastCount: 1,
};

beforeEach(() => {
  jest.mocked(createSavedMeal).mockReset();
  jest.mocked(deleteSavedMeal).mockReset();
  jest.mocked(updateSavedMeal).mockReset();
});

/** The sheet as the Library mounts it: a new meal, or with `meal` its edit, with `archive` when given. */
function renderSheet({
  meal,
  archive,
  holding = false,
}: { meal?: SavedMeal; archive?: MealSheetArchive; holding?: boolean } = {}) {
  const calls: string[] = [];
  const handlers = {
    onClose: jest.fn(() => calls.push("close")),
    onGone: jest.fn(),
    onDeleted: jest.fn((id: string) => calls.push(`deleted ${id}`)),
  };
  const { onClose, onGone, onDeleted } = handlers;
  render(
    <TodayContext.Provider
      value={{
        today: "2026-11-16",
        holding,
        confirm: holding ? "checking" : "fresh",
        unconfirmed: false,
        retry: () => {},
      }}
    >
      <SavedMealSheet
        open
        returnFocusTo={null}
        onClose={onClose}
        sources={[]}
        {...(meal
          ? { kind: "edit" as const, meal, archive, onGone, onDeleted }
          : { kind: "new" as const, initialName: "" })}
      />
    </TodayContext.Provider>,
  );
  return { ...handlers, calls };
}

/** An `archive` whose `set` answers `outcome`. */
const archiveAnswering = (outcome: (archived: boolean) => ArchiveOutcome, busy = false) => {
  const set = jest.fn(async (archived: boolean) => outcome(archived));
  return { busy, set };
};

const sheet = () => screen.getAllByRole("dialog")[0];
const input = (label: string) => within(sheet()).getByLabelText(label, { selector: "input" }) as HTMLInputElement;

describe("SavedMealSheet without logging", () => {
  it("saves only: no Eaten or planned, Save meal is the one submit, and it sends the meal alone", async () => {
    jest.mocked(createSavedMeal).mockImplementation(async (body) => ({ ...bowl, ...body, lastCount: null }));
    const h = renderSheet();
    expect(within(sheet()).queryByRole("radiogroup")).toBeNull();
    expect(within(sheet()).queryByRole("button", { name: /^Save and/ })).toBeNull();
    expect(sheet().querySelector("[data-footer-start]")).toBeNull();
    fireEvent.change(input("Name"), { target: { value: "Chicken bowl" } });
    fireEvent.change(input("Calories"), { target: { value: "640" } });
    fireEvent.change(input("Protein"), { target: { value: "42" } });
    fireEvent.change(input("Carbohydrates"), { target: { value: "61" } });
    fireEvent.change(input("Fat"), { target: { value: "22,5" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(h.onClose).toHaveBeenCalled());
    expect(createSavedMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Chicken bowl",
        figures: { energyKcal: 640, proteinG: 42, carbsG: 61, fatG: 22.5 },
      }),
    );
  });

  it("deletes after asking in a confirmation stacked on it, closes itself, then tells the host", async () => {
    jest.mocked(deleteSavedMeal).mockResolvedValue(undefined);
    const h = renderSheet({ meal: bowl });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Chicken bowl?" });
    expect(document.querySelector("[data-sheet-backdrop][data-sheet-stacked]")).not.toBeNull();
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(h.onDeleted).toHaveBeenCalledWith(bowl.id));
    expect(h.calls).toEqual(["close", `deleted ${bowl.id}`]);
    expect(deleteSavedMeal).toHaveBeenCalledTimes(1);
  });

  it("keeps the confirmation open with its line when the delete fails, and closes nothing", async () => {
    jest.mocked(deleteSavedMeal).mockRejectedValue(refusal(500, "internal"));
    const h = renderSheet({ meal: bowl });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Chicken bowl?" });
    await confirmArmed();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(within(confirm).getByRole("alert")).not.toBeEmptyDOMElement());
    expect(h.onClose).not.toHaveBeenCalled();
    expect(h.onDeleted).not.toHaveBeenCalled();
  });

  it("offers no archive without `archive`, as on the log sheet, whose meal view archives", () => {
    renderSheet({ meal: bowl });
    expect(within(sheet()).queryByRole("button", { name: "Archive meal" })).toBeNull();
  });

  it("archives through the host, turns the button on the answer, and keeps that state itself", async () => {
    const archive = archiveAnswering((archived) => ({ ok: true, meal: { ...bowl, archived } }));
    renderSheet({ meal: bowl, archive });
    const button = within(sheet()).getByRole("button", { name: "Archive meal" });
    // After the figures: the end of the form.
    expect(input("Fat").compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveTextContent("Restore meal"));
    expect(archive.set).toHaveBeenLastCalledWith(true);
    fireEvent.click(button);
    await waitFor(() => expect(button).toHaveTextContent("Archive meal"));
    expect(archive.set).toHaveBeenLastCalledWith(false);
  });

  it("shows the failure the host answers on the sheet's error line, and keeps the button as it was", async () => {
    const archive = archiveAnswering(() => ({ ok: false, failure: "You are offline." }));
    renderSheet({ meal: bowl, archive });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Archive meal" }));
    await waitFor(() => expect(within(sheet()).getByRole("alert")).toHaveTextContent("You are offline."));
    expect(within(sheet()).getByRole("button", { name: "Archive meal" })).toBeInTheDocument();
  });

  it("says Restore meal for an archived meal, and refuses a press while one runs", () => {
    const archive = archiveAnswering(() => ({ ok: false, failure: null }), true);
    renderSheet({ meal: { ...bowl, archived: true }, archive });
    const restore = within(sheet()).getByRole("button", { name: "Restore meal" });
    expect(restore).toHaveAttribute("aria-busy", "true");
    fireEvent.click(restore);
    expect(archive.set).not.toHaveBeenCalled();
  });

  it("holds Archive meal while the app asks the server for today, with no logging to hold it", async () => {
    const archive = archiveAnswering((archived) => ({ ok: true, meal: { ...bowl, archived } }));
    renderSheet({ meal: bowl, archive, holding: true });
    const button = within(sheet()).getByRole("button", { name: "Archive meal" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    await act(async () => {});
    expect(archive.set).not.toHaveBeenCalled();
    expect(button).toHaveTextContent("Archive meal");
  });

  it("holds Delete and Save while an archive runs", async () => {
    const archive = archiveAnswering(() => ({ ok: false, failure: null }), true);
    renderSheet({ meal: bowl, archive });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Delete" }));
    fireEvent.change(input("Name"), { target: { value: "Chicken rice bowl" } });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Save meal" }));
    await act(async () => {});
    expect(screen.queryByRole("dialog", { name: "Delete Chicken bowl?" })).toBeNull();
    expect(updateSavedMeal).not.toHaveBeenCalled();
  });
});
