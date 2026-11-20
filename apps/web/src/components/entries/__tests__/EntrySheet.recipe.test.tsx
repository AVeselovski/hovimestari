import { clockFrom } from "@/__tests__/helpers/clock";
import { setTestLocale } from "@/__tests__/helpers/locale";
import { TODAY, dayOf, fakeEntryActions, recipeEntry } from "@/components/day/__tests__/support";
import { refusal } from "@/components/targets/__tests__/support";
import { TodayContext, type TodayState } from "@/hooks/useToday";
import type { Entry } from "@hovimestari/types";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { EntrySheet } from "../EntrySheet";

// ---------------------------------------------------------------------------
// The entry sheet for a recipe entry: its Servings field, the preview of the
// figures for the servings typed, the limits a serving count takes, and a
// recipe deleted while a day uses it. The app's today is Monday 16 November
// 2026, the clock runs from noon that day, and figures format as a British
// phone. Each entry comes from `dayOf`, as a day answers it.
// ---------------------------------------------------------------------------

/** One serving of shakshuka, as the recipe computes it. */
const SHAKSHUKA = { energyKcal: 243.3, proteinG: 14.5, carbsG: 12.1, fatG: 15.2 };

const TODAY_STATE: TodayState = { today: TODAY, holding: false, confirm: "fresh", unconfirmed: false, retry: () => {} };

let actions = fakeEntryActions();
beforeEach(() => {
  clockFrom(`${TODAY}T12:00:00Z`);
  setTestLocale("en-GB");
  actions = fakeEntryActions();
});
afterEach(() => jest.restoreAllMocks());

/** A planned shakshuka of 1.5 servings, as today's day answers it. */
function shakshuka(overrides: Partial<Entry> = {}): Entry {
  return dayOf([recipeEntry("Shakshuka", 1.5, SHAKSHUKA, { status: "planned", ...overrides })]).entries[0];
}

function renderSheet(entry: Entry = shakshuka(), onClose = jest.fn()) {
  return render(
    <TodayContext.Provider value={TODAY_STATE}>
      <EntrySheet
        open
        returnFocusTo={null}
        onClose={onClose}
        entry={entry}
        actions={actions}
        focusAfterRemove={() => null}
      />
    </TodayContext.Provider>,
  );
}

const dialog = () => screen.getByRole("dialog", { name: "Shakshuka" });
const servings = () => within(dialog()).getByLabelText("Servings", { selector: "input" }) as HTMLInputElement;
const preview = () => [...dialog().querySelectorAll("[data-entry-preview] dd")].map((d) => d.textContent);
const line = () => document.getElementById(`${servings().id}-line`)!;
const save = () => within(dialog()).getByRole("button", { name: "Save" });

describe("EntrySheet, a recipe entry", () => {
  it("holds the servings in a Servings field with the decimal keyboard, read as servings", () => {
    renderSheet();
    expect(servings()).toHaveValue("1.5");
    expect(servings()).toHaveAttribute("inputmode", "decimal");
    expect(servings()).toHaveAccessibleName("Servings");
    expect(servings()).toHaveAccessibleDescription(/^servings/);
    // A recipe entry has no unit chips: its amount is a count of servings.
    expect(within(dialog()).queryByRole("radiogroup", { name: "Amount" })).toBeNull();
    expect(within(dialog()).queryByLabelText("Amount", { selector: "input" })).toBeNull();
  });

  it("shows the server's figures as saved, then the figures for the servings typed, and back", () => {
    const entry = shakshuka();
    renderSheet(entry);
    const saved = preview();
    expect(saved[0]).toBe("365 kcal");
    fireEvent.change(servings(), { target: { value: "2" } });
    expect(preview()).toEqual(["487 kcal", "29.0 g", "24.2 g", "30.4 g"]);
    expect(dialog()).toHaveTextContent("For this amount");
    fireEvent.change(servings(), { target: { value: "1,5" } });
    expect(preview()).toEqual(saved);
    fireEvent.change(servings(), { target: { value: "" } });
    expect(dialog()).toHaveTextContent("Enter an amount to see its figures.");
  });

  it("saves the new servings alone", async () => {
    const onClose = jest.fn();
    const entry = shakshuka();
    renderSheet(entry, onClose);
    fireEvent.change(servings(), { target: { value: "2" } });
    await act(async () => fireEvent.click(save()));
    expect(actions.save).toHaveBeenCalledWith(entry, { servings: 2 });
    expect(onClose).toHaveBeenCalled();
  });

  it("saves Eaten alone for a planned recipe entry today, the servings untouched", async () => {
    const entry = shakshuka();
    renderSheet(entry);
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Eaten" }));
    await act(async () => fireEvent.click(save()));
    expect(actions.save).toHaveBeenCalledWith(entry, { status: "eaten" });
  });

  it.each([
    ["0", "Enter 0.01 to 100, two decimals at most."],
    ["100.01", "Enter 0.01 to 100, two decimals at most."],
    ["-1", "Enter 0.01 to 100, two decimals at most."],
    ["1 000", "Enter 0.01 to 100, two decimals at most."],
    ["1.255", "Enter 0.01 to 100, two decimals at most."],
    ["1,255", "Enter 0.01 to 100, two decimals at most."],
  ])("refuses %s servings in the field's own line, sends nothing and keeps the field's focus", async (typed, says) => {
    renderSheet();
    fireEvent.change(servings(), { target: { value: typed } });
    await act(async () => fireEvent.click(save()));
    expect(actions.save).not.toHaveBeenCalled();
    expect(servings()).toHaveAttribute("aria-invalid", "true");
    expect(line()).toHaveTextContent(says);
    expect(servings()).toHaveAccessibleDescription(new RegExp(says.replace(/\./g, "\\.")));
    expect(document.activeElement).toBe(servings());
  });

  it.each([
    ["100", 100],
    ["0.01", 0.01],
  ])("takes %s servings, an end of the range", async (typed, sent) => {
    const entry = shakshuka();
    renderSheet(entry);
    fireEvent.change(servings(), { target: { value: typed } });
    await act(async () => fireEvent.click(save()));
    expect(actions.save).toHaveBeenCalledWith(entry, { servings: sent });
  });

  it("shows the server's refusal of the servings in the field's line", async () => {
    jest.mocked(actions.save).mockRejectedValue(refusal(400, "entry_count_invalid"));
    renderSheet();
    fireEvent.change(servings(), { target: { value: "3" } });
    await act(async () => fireEvent.click(save()));
    expect(servings()).toHaveAttribute("aria-invalid", "true");
    expect(line()).toHaveTextContent("Enter 0.01 to 100, two decimals at most.");
  });

  it("shows a serving the server finds too large under the form, by its own line", async () => {
    jest.mocked(actions.save).mockRejectedValue(refusal(400, "recipe_serving_too_large"));
    renderSheet();
    fireEvent.change(servings(), { target: { value: "3" } });
    await act(async () => fireEvent.click(save()));
    expect(dialog()).toHaveTextContent(
      "One serving comes to more than 10000 kcal or 1000 g of protein, carbs or fat. Check the amounts.",
    );
    expect(servings()).not.toHaveAttribute("aria-invalid");
    expect(servings()).toHaveValue("3");
  });

  it("says a deleted recipe was deleted, and keeps its name, servings and figures", () => {
    const entry = shakshuka({ recipe: { id: "00000000-0000-4000-9000-0000000000aa", archived: false, deleted: true } });
    renderSheet(entry);
    expect(within(dialog()).getByText("This recipe was deleted.")).toBeInTheDocument();
    expect(servings()).toHaveValue("1.5");
    expect(preview()[0]).toBe("365 kcal");
  });

  it("says nothing of an archived recipe: it is still the person's", () => {
    renderSheet(shakshuka({ recipe: { id: "00000000-0000-4000-9000-0000000000ab", archived: true, deleted: false } }));
    expect(within(dialog()).queryByText("This recipe was deleted.")).toBeNull();
  });

  it("puts Eaten or planned first, then Servings, the figures and the date", () => {
    renderSheet();
    const order = [
      within(dialog()).getByRole("radiogroup", { name: "Eaten or planned" }),
      servings(),
      dialog().querySelector("[data-entry-preview]")!,
      within(dialog()).getByLabelText("Date"),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});
