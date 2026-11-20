import { describeFormSheetContract } from "@/__tests__/formSheet";
import { deferred } from "@/__tests__/helpers/queryClient";
import {
  estimateEntry,
  fakeEntryActions,
  foodEntry,
  mealEntry,
  portionEntry,
} from "@/components/day/__tests__/support";
import { detailOf, fineliFood, ownPortion } from "@/components/foods/__tests__/support";
import { refusal } from "@/components/targets/__tests__/support";
import { TodayContext, type TodayState } from "@/hooks/useToday";
import { getFood } from "@/lib/api/foods";
import { newId } from "@/lib/newId";
import type { Entry, FoodDetail } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EntrySheet } from "../EntrySheet";

jest.mock("@/lib/api/foods", () => ({ getFood: jest.fn() }));

let actions = fakeEntryActions();
beforeEach(() => {
  actions = fakeEntryActions();
  jest
    .mocked(getFood)
    .mockReset()
    .mockReturnValue(new Promise(() => {}));
});

const quark = foodEntry("Quark", 250, { status: "planned" });
const dialog = () => screen.getByRole("dialog", { name: "Quark" });
const amount = () => within(dialog()).getByLabelText("Amount", { selector: "input" }) as HTMLInputElement;
const chips = () =>
  within(dialog())
    .getAllByRole("radio")
    .filter((r) => r.hasAttribute("data-unit"))
    .map((r) => [r.textContent, r.getAttribute("aria-checked")]);
const preview = () => [...dialog().querySelectorAll("[data-entry-preview] dd")].map((d) => d.textContent);

function renderSheet(entry: Entry = quark, onClose = jest.fn()) {
  return render(
    <EntrySheet
      open
      returnFocusTo={null}
      onClose={onClose}
      entry={entry}
      actions={actions}
      focusAfterRemove={() => null}
    />,
  );
}

describe("EntrySheet", () => {
  describeFormSheetContract({
    endsInLine: true,
    name: /^quark$/i,
    panelClass: "md:max-w-md",
    renderSheet: (p) => <EntrySheet {...p} entry={quark} actions={actions} focusAfterRemove={() => null} />,
    type: () => fireEvent.change(amount(), { target: { value: "300" } }),
    typedField: () => amount(),
    fillValid: () => fireEvent.change(amount(), { target: { value: "300" } }),
    holdSave: () => {
      const held = deferred<"done">();
      jest.mocked(actions.save).mockReturnValue(held.promise);
      return { resolve: () => held.resolve("done"), reject: () => held.reject(new Error("refused")) };
    },
    firstField: () => amount(),
  });

  it("keeps Remove entry unavailable while Save runs", async () => {
    const held = deferred<"done">();
    jest.mocked(actions.save).mockReturnValue(held.promise);
    renderSheet();
    fireEvent.change(amount(), { target: { value: "300" } });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
    const remove = within(dialog()).getByRole("button", { name: "Remove entry" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(remove);
    expect(actions.remove).not.toHaveBeenCalled();
    await act(async () => held.resolve("done"));
  });

  it("gives Remove entry's row to the keyboard while it is open, so Save stays above it", () => {
    renderSheet();
    const remove = within(dialog()).getByRole("button", { name: "Remove entry" });
    expect(remove.closest(".keyboard-yields")).not.toBeNull();
  });

  it("opens on the entry's own portion chip and count, and the food's detail answering later moves neither", async () => {
    const food = fineliFood("Milk");
    const glass = ownPortion("Glass", 200);
    const cup = ownPortion("Cup", 250);
    const milk = portionEntry(
      "Milk",
      2,
      200,
      { id: glass.id, name: "Glass" },
      {
        food: { id: food.id, source: "fineli", retired: false, deleted: false },
      },
    );
    const detail = deferred<FoodDetail>();
    jest.mocked(getFood).mockReturnValue(detail.promise);
    render(
      <EntrySheet
        open
        returnFocusTo={null}
        onClose={jest.fn()}
        entry={milk}
        actions={actions}
        focusAfterRemove={() => null}
      />,
    );
    const sheet = screen.getByRole("dialog", { name: "Milk" });
    const field = within(sheet).getByLabelText("Amount", { selector: "input" });
    expect(field).toHaveValue("2");
    const before = within(sheet)
      .getAllByRole("radio")
      .filter((r) => r.hasAttribute("data-unit"));
    expect(before.map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([
      ["g", "false"],
      ["Glass · 200\u00a0g", "true"],
    ]);
    await act(async () => detail.resolve(detailOf(food, { portions: [cup, glass] })));
    const chips = (): HTMLElement[] =>
      within(sheet)
        .getAllByRole("radio")
        .filter((r) => r.hasAttribute("data-unit"));
    // TanStack tells the sheet on a timer, which a busy machine runs late.
    await waitFor(() => expect(chips()).toHaveLength(3));
    const after = chips();
    expect(after.map((r) => [r.textContent, r.getAttribute("aria-checked")])).toEqual([
      ["g", "false"],
      ["Glass · 200\u00a0g", "true"],
      ["Cup · 250\u00a0g", "false"],
    ]);
    // The chips already shown are the same elements, in the same place.
    expect(after.slice(0, 2)).toEqual(before);
    expect(field).toHaveValue("2");
  });

  it("shows a hidden food's note at once, offers grams only and reads no detail", () => {
    renderSheet(foodEntry("Quark", 250, { food: { id: newId(), source: "user", retired: false, deleted: true } }));
    expect(within(dialog()).getByText("This food is no longer in your foods.")).toBeInTheDocument();
    expect(chips()).toEqual([["g", "true"]]);
    expect(getFood).not.toHaveBeenCalled();
  });

  it("shows the server's own figures until the amount changes", () => {
    const server = { ...quark, figures: { energyKcal: 151, proteinG: 31.2, carbsG: 9, fatG: 0.5 } };
    renderSheet(server);
    expect(preview()).toEqual(["151\u00a0kcal", "31.2\u00a0g", "9.0\u00a0g", "0.5\u00a0g"]);
    expect(dialog()).toHaveTextContent("For this amount");
    fireEvent.change(amount(), { target: { value: "100" } });
    expect(preview()).toEqual(["59\u00a0kcal", "12.4\u00a0g", "3.6\u00a0g", "0.2\u00a0g"]);
    fireEvent.change(amount(), { target: { value: "250" } });
    expect(preview()).toEqual(["151\u00a0kcal", "31.2\u00a0g", "9.0\u00a0g", "0.5\u00a0g"]);
  });

  it("converts the amount on a chip switch: 2 × a 55 g portion to grams is 110", async () => {
    const food = fineliFood("Milk");
    const glass = ownPortion("Glass", 55);
    const milk = portionEntry(
      "Milk",
      2,
      55,
      { id: glass.id, name: "Glass" },
      {
        food: { id: food.id, source: "fineli", retired: false, deleted: false },
      },
    );
    render(
      <EntrySheet
        open
        returnFocusTo={null}
        onClose={jest.fn()}
        entry={milk}
        actions={actions}
        focusAfterRemove={() => null}
      />,
    );
    const sheet = screen.getByRole("dialog", { name: "Milk" });
    fireEvent.click(within(sheet).getByRole("radio", { name: "g" }));
    expect(within(sheet).getByLabelText("Amount", { selector: "input" })).toHaveValue("110");
    fireEvent.click(within(sheet).getByRole("radio", { name: "Glass · 55\u00a0g" }));
    expect(within(sheet).getByLabelText("Amount", { selector: "input" })).toHaveValue("1");
  });

  describe("why Eaten is unavailable", () => {
    const TODAY_STATE: TodayState = {
      today: "2026-11-16",
      holding: false,
      confirm: "fresh",
      unconfirmed: false,
      retry: () => {},
    };
    function renderOn(entry: Entry) {
      return render(
        <TodayContext.Provider value={TODAY_STATE}>
          <EntrySheet
            open
            returnFocusTo={null}
            onClose={jest.fn()}
            entry={entry}
            actions={actions}
            focusAfterRemove={() => null}
          />
        </TodayContext.Provider>,
      );
    }
    const group = () => within(dialog()).getByRole("radiogroup", { name: "Eaten or planned" });
    const dateLine = () => document.getElementById(`${within(dialog()).getByLabelText("Date").id}-line`)!;

    it("keeps no line under Eaten or planned: the block under it starts one section gap below", () => {
      renderOn(quark);
      const block = dialog().querySelector<HTMLElement>("[data-state-choice]")!;
      expect(block).toContainElement(group());
      // Nothing after the tray inside its block, so no room is reserved under it.
      expect(group().nextElementSibling).toBeNull();
      expect(block.className.split(/\s+/)).toContain("not-last:mb-2");
    });

    it("says it in the date's own line on a future date, and the group points there", () => {
      renderOn({ ...quark, date: "2026-11-17" });
      expect(within(dialog()).getByRole("radio", { name: "Eaten" })).toHaveAttribute("aria-disabled", "true");
      expect(dateLine()).toHaveTextContent("Future days hold planned entries.");
      expect(group()).toHaveAccessibleDescription("Future days hold planned entries.");
      expect(dateLine()).toContainElement(document.getElementById(group().getAttribute("aria-describedby")!));
      expect(within(dialog()).getByLabelText("Date")).toHaveAccessibleDescription("Future days hold planned entries.");
      expect(within(dialog()).getByLabelText("Date")).not.toHaveAttribute("aria-invalid");
      expect(group().nextElementSibling).toBeNull();
    });

    it("never gives a date's error as the reason for Eaten or planned", () => {
      renderOn(quark);
      fireEvent.change(within(dialog()).getByLabelText("Date"), { target: { value: "" } });
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
      expect(dateLine()).toHaveTextContent("Enter a valid date.");
      expect(within(dialog()).getByLabelText("Date")).toHaveAccessibleDescription("Enter a valid date.");
      expect(group()).toHaveAccessibleDescription("");
      // Read as the field's description, not announced a second time from a live region.
      expect(dateLine().closest("[aria-live]")).toBeNull();
    });

    it("points Eaten or planned at no line on a day that can be either: the date's hint is empty there", () => {
      renderOn(quark);
      expect(group()).not.toHaveAttribute("aria-describedby");
    });

    it("points Eaten or planned at no empty line when a future date's line holds a refusal, and back at it once the date changes", async () => {
      jest.mocked(actions.save).mockRejectedValue(refusal(400, "invalid_date"));
      renderOn({ ...quark, date: "2026-11-17" });
      expect(group()).toHaveAttribute("aria-describedby");
      fireEvent.click(within(dialog()).getByRole("radio", { name: "Planned" }));
      fireEvent.change(within(dialog()).getByLabelText("Amount", { selector: "input" }), { target: { value: "300" } });
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save" }));
      await waitFor(() => expect(dateLine()).toHaveTextContent("Enter a valid date."));
      // Still a future day, but its hint span is empty while the refusal shows.
      expect(within(dialog()).getByRole("radio", { name: "Eaten" })).toHaveAttribute("aria-disabled", "true");
      expect(group()).not.toHaveAttribute("aria-describedby");
      fireEvent.change(within(dialog()).getByLabelText("Date"), { target: { value: "2026-11-18" } });
      expect(group()).toHaveAccessibleDescription("Future days hold planned entries.");
    });

    it("fills the date's line when the date moves to a future day, and empties it when it moves back", () => {
      renderOn(quark);
      const date = within(dialog()).getByLabelText("Date");
      expect(dateLine()).toHaveTextContent("");
      fireEvent.change(date, { target: { value: "2026-11-20" } });
      expect(dateLine()).toHaveTextContent("Future days hold planned entries.");
      expect(within(dialog()).getByRole("radio", { name: "Planned" })).toHaveAttribute("aria-checked", "true");
      fireEvent.change(date, { target: { value: "2026-11-15" } });
      expect(dateLine()).toHaveTextContent("");
    });
  });

  it("while the app asks for today, Save and Remove entry wait, and Cancel and dismissal stay free", () => {
    actions = fakeEntryActions({ holding: true });
    const onClose = jest.fn();
    renderSheet(quark, onClose);
    fireEvent.change(amount(), { target: { value: "300" } });
    const save = within(dialog()).getByRole("button", { name: "Save" });
    const remove = within(dialog()).getByRole("button", { name: "Remove entry" });
    expect(save).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(save);
    fireEvent.click(remove);
    expect(actions.save).not.toHaveBeenCalled();
    expect(actions.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open with what is typed when a save was held and sent nothing", async () => {
    jest.mocked(actions.save).mockResolvedValue("held");
    const onClose = jest.fn();
    renderSheet(quark, onClose);
    fireEvent.change(amount(), { target: { value: "300" } });
    await act(async () => fireEvent.click(within(dialog()).getByRole("button", { name: "Save" })));
    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(amount()).toHaveValue("300");
    expect(within(dialog()).getByRole("button", { name: "Save" })).not.toHaveAttribute("aria-disabled");
  });

  it("keeps Remove entry free again after a removal was held", async () => {
    jest.mocked(actions.remove).mockResolvedValue("held");
    const onClose = jest.fn();
    renderSheet(quark, onClose);
    await act(async () => fireEvent.click(within(dialog()).getByRole("button", { name: "Remove entry" })));
    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole("button", { name: "Remove entry" })).not.toHaveAttribute("aria-disabled");
  });

  it("clears the amount's refusal on its next change, and asks for an amount only while the field is empty", async () => {
    renderSheet();
    fireEvent.change(amount(), { target: { value: "0" } });
    expect(dialog()).not.toHaveTextContent("Enter an amount to see its figures.");
    await act(async () => fireEvent.click(within(dialog()).getByRole("button", { name: "Save" })));
    expect(amount()).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(amount(), { target: { value: "5" } });
    expect(amount()).not.toHaveAttribute("aria-invalid", "true");
    fireEvent.change(amount(), { target: { value: "" } });
    expect(dialog()).toHaveTextContent("Enter an amount to see its figures.");
  });

  it("names a portion count's unit portions and a saved meal's meals", () => {
    const glass = ownPortion("Glass", 200);
    const { unmount } = renderSheet(portionEntry("Milk", 2, 200, { id: glass.id, name: "Glass" }, {}));
    const milk = screen.getByRole("dialog", { name: "Milk" });
    expect(within(milk).getByLabelText("Amount", { selector: "input" })).toHaveAccessibleDescription(/portions/);
    unmount();
    renderSheet(mealEntry("Lunch", 1, { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 }));
    const lunch = screen.getByRole("dialog", { name: "Lunch" });
    expect(within(lunch).getByLabelText("Meals", { selector: "input" })).toHaveAccessibleDescription(/meals/);
  });

  it.each(["1.255", "1,255"])("refuses %s meals with the range's line, not the thousands group's", async (typed) => {
    renderSheet(mealEntry("Lunch", 1, { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 }));
    const lunch = screen.getByRole("dialog", { name: "Lunch" });
    const meals = within(lunch).getByLabelText("Meals", { selector: "input" });
    fireEvent.change(meals, { target: { value: typed } });
    await act(async () => fireEvent.click(within(lunch).getByRole("button", { name: "Save" })));
    expect(actions.save).not.toHaveBeenCalled();
    expect(document.getElementById(`${meals.id}-line`)).toHaveTextContent("Enter 0.01 to 100, two decimals at most.");
  });

  it("clamps a long name in the title to two lines", () => {
    renderSheet(foodEntry("A very long name ".repeat(8).trim(), 100));
    const title = screen.getByRole("heading", { level: 2 });
    expect(title.className.split(" ")).toContain("line-clamp-2");
  });

  it("names the preview's energy row Calories, as the rest of the sheet and the Day tab do", () => {
    renderSheet();
    const rows = [...dialog().querySelectorAll("[data-entry-preview] dt")].map((d) => d.textContent);
    expect(rows[0]).toBe("Calories");
    expect(dialog()).not.toHaveTextContent("Energy");
  });
  it.each([
    ["a food", quark, "Amount"],
    ["a saved meal", mealEntry("Lunch", 1, { energyKcal: 600, proteinG: 40, carbsG: 60, fatG: 20 }), "Meals"],
    ["an estimate", estimateEntry("Cafe lunch", { energyKcal: 700, proteinG: 30, carbsG: 80, fatG: 25 }), "Name"],
  ])("puts Eaten or planned first for %s, then the amount, the figures and the date", (_, entry, first) => {
    renderSheet(entry);
    const sheet = screen.getByRole("dialog", { name: entry.name });
    const chips = within(sheet).queryByRole("radiogroup", { name: "Amount" });
    const order = [
      within(sheet).getByRole("radiogroup", { name: "Eaten or planned" }),
      ...(chips ? [chips] : []),
      within(sheet).getByLabelText(first, { selector: "input" }),
      sheet.querySelector("[data-entry-preview]")!,
      within(sheet).getByLabelText("Date"),
    ];
    expect(chips !== null).toBe(entry.kind === "food");
    // Document order is the Tab order: none of these sets a positive tabIndex.
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});
