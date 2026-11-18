import { describeFormSheetContract } from "@/__tests__/formSheet";
import { deferred } from "@/__tests__/helpers/queryClient";
import type { SaveAndLogDone } from "@/hooks/entryActions";
import { createSavedMeal, updateSavedMeal } from "@/lib/api/savedMeals";
import type { SaveAndLogBody, SavedMeal } from "@hovimestari/types";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SavedMealSheet, type SavedMealSheetProps } from "../SavedMealSheet";

// The saved meal sheet on its own: its fields, what each of its two submits
// sends, and the form sheet contract. The log sheet suites run it stacked
// on the log sheet against the fake server.

jest.mock("@/lib/api/savedMeals", () => ({ createSavedMeal: jest.fn(), updateSavedMeal: jest.fn() }));

const DATE = "2026-11-16";
const bowl: SavedMeal = {
  id: "11111111-1111-4111-9111-111111111111",
  name: "Chicken bowl",
  source: "Wolt",
  figures: { energyKcal: 640, proteinG: 42, carbsG: 61, fatG: 22.5 },
  archived: false,
  lastCount: 1,
};

function actions(saveAndLog: jest.Mock = jest.fn()) {
  return { saveAndLog, withdrawAdd: jest.fn(), holding: false };
}

function renderSheet(props: Partial<SavedMealSheetProps> = {}) {
  const handlers = {
    onClose: jest.fn(),
    onSaved: jest.fn(),
    onLogged: jest.fn(),
    onSavedMeal: jest.fn(),
    onGone: jest.fn(),
  };
  render(
    <SavedMealSheet
      open
      returnFocusTo={null}
      initialName=""
      date={DATE}
      sources={["Foodora", "Wolt"]}
      actions={actions()}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const dialog = () => screen.getByRole("dialog");
const input = (label: string) => within(dialog()).getByLabelText(label, { selector: "input" }) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(input(label), { target: { value } });
function fill(): void {
  type("Name", "Chicken bowl");
  type("Calories", "640");
  type("Protein", "42");
  type("Carbohydrates", "61");
  type("Fat", "22,5");
}

beforeEach(() => {
  jest.mocked(createSavedMeal).mockReset();
  jest.mocked(updateSavedMeal).mockReset();
});

// The contract's Save is the primary, "Save and log", whose save is the log sheet's action.
let contractSaveAndLog = jest.fn();

describe("SavedMealSheet, new", () => {
  beforeEach(() => {
    contractSaveAndLog = jest.fn();
  });
  describeFormSheetContract({
    endsInLine: true,
    name: /^new saved meal$/i,
    panelClass: "md:max-w-lg",
    renderSheet: (p) => (
      <SavedMealSheet
        {...p}
        initialName=""
        date={DATE}
        sources={[]}
        actions={{ saveAndLog: (r) => contractSaveAndLog(r), withdrawAdd: jest.fn(), holding: false }}
        onLogged={jest.fn()}
        onSavedMeal={jest.fn()}
        onGone={jest.fn()}
      />
    ),
    type: () => type("Name", "Bowl"),
    typedField: () => input("Name"),
    fillValid: fill,
    holdSave: () => {
      const held = deferred<SaveAndLogDone>();
      contractSaveAndLog.mockReturnValue(held.promise);
      return {
        resolve: () => held.resolve({ outcome: "created", meal: bowl, announce: jest.fn() }),
        reject: () => held.reject(new Error("refused")),
      };
    },
    firstField: () => input("Name"),
    saveName: /^save and log$/i,
  });
});

describe("SavedMealSheet", () => {
  it("opens with From empty and the user's sources as chips under it; a chip fills it and shows chosen", () => {
    renderSheet();
    expect(input("From (optional)").value).toBe("");
    const chips = within(dialog()).getByRole("group", { name: "Your sources" });
    expect(
      within(chips)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Foodora", "Wolt"]);
    expect(within(chips).getByRole("button", { name: "Wolt" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(chips).getByRole("button", { name: "Wolt" }));
    expect(input("From (optional)").value).toBe("Wolt");
    expect(within(chips).getByRole("button", { name: "Wolt" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chips).getByRole("button", { name: "Foodora" })).toHaveAttribute("aria-pressed", "false");
  });

  it("asks Eaten or planned first, then Name, From and the four figures, in document order", () => {
    renderSheet();
    const order = [
      within(dialog()).getByRole("radiogroup", { name: "Eaten or planned" }),
      input("Name"),
      input("From (optional)"),
      input("Calories"),
      input("Protein"),
      input("Carbohydrates"),
      input("Fat"),
    ];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("moves from Name to Calories on Enter, and sends nothing", () => {
    const saveAndLog = jest.fn();
    renderSheet({ actions: actions(saveAndLog) });
    input("Name").focus();
    fireEvent.keyDown(input("Name"), { key: "Enter" });
    expect(input("Calories")).toHaveFocus();
    expect(saveAndLog).not.toHaveBeenCalled();
  });

  it("saves and logs one meal in one request with ids made at open, eaten on today, and closes", async () => {
    const done: SaveAndLogDone = { outcome: "created", meal: bowl, announce: jest.fn() };
    const saveAndLog = jest.fn().mockResolvedValue(done);
    const h = renderSheet({ actions: actions(saveAndLog) });
    fill();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Wolt" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save and log" }));
    await waitFor(() => expect(h.onClose).toHaveBeenCalledTimes(1));
    expect(saveAndLog).toHaveBeenCalledTimes(1);
    const body: SaveAndLogBody = saveAndLog.mock.calls[0][0].body;
    expect(body).toEqual({
      meal: {
        id: expect.any(String),
        name: "Chicken bowl",
        source: "Wolt",
        figures: { energyKcal: 640, proteinG: 42, carbsG: 61, fatG: 22.5 },
      },
      entry: { id: expect.any(String), date: DATE, status: "eaten", count: 1 },
    });
    expect(h.onLogged).toHaveBeenCalledWith(done);
    expect(createSavedMeal).not.toHaveBeenCalled();
  });

  it("with Planned chosen reads Save and add to plan, and sends planned", async () => {
    const saveAndLog = jest.fn().mockResolvedValue({ outcome: "created", meal: bowl, announce: jest.fn() });
    renderSheet({ actions: actions(saveAndLog) });
    fill();
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Planned" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save and add to plan" }));
    await waitFor(() => expect(saveAndLog).toHaveBeenCalledTimes(1));
    expect(saveAndLog.mock.calls[0][0].body.entry.status).toBe("planned");
  });

  it("Save meal saves without logging, and a Save and log after a Save meal that timed out sends the same meal id", async () => {
    jest
      .mocked(createSavedMeal)
      .mockRejectedValueOnce(Object.assign(new Error("timeout"), { isAxiosError: true, code: "ECONNABORTED" }));
    const saveAndLog = jest.fn().mockResolvedValue({ outcome: "created", meal: bowl, announce: jest.fn() });
    const h = renderSheet({ actions: actions(saveAndLog) });
    fill();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save meal" }));
    await within(dialog()).findByText("Could not confirm. Check your connection and try again.");
    expect(createSavedMeal).toHaveBeenCalledTimes(1);
    expect(saveAndLog).not.toHaveBeenCalled();
    const mealId = jest.mocked(createSavedMeal).mock.calls[0][0].id;
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save and log" }));
    await waitFor(() => expect(saveAndLog).toHaveBeenCalledTimes(1));
    expect(saveAndLog.mock.calls[0][0].body.meal.id).toBe(mealId);
    expect(h.onLogged).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a timeout", Object.assign(new Error("timeout"), { isAxiosError: true, code: "ECONNABORTED" })],
    ["a server fault", Object.assign(new Error("500"), { isAxiosError: true, response: { status: 502, data: {} } })],
  ])("Save and log after %s sends the same meal id and entry id again", async (_name, failure) => {
    const saveAndLog = jest
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValue({ outcome: "created", meal: bowl, announce: jest.fn() });
    renderSheet({ actions: actions(saveAndLog) });
    fill();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save and log" }));
    await within(dialog()).findByText("Could not confirm. Check your connection and try again.");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save and log" }));
    await waitFor(() => expect(saveAndLog).toHaveBeenCalledTimes(2));
    const [first, second] = saveAndLog.mock.calls.map(([r]) => r.body as SaveAndLogBody);
    expect(second.meal.id).toBe(first.meal.id);
    expect(second.entry.id).toBe(first.entry.id);
  });

  it("sends nothing while the app knows it is offline, by either button, and says so", async () => {
    const onLine = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try {
      const saveAndLog = jest.fn();
      renderSheet({ actions: actions(saveAndLog) });
      fill();
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save and log" }));
      await within(dialog()).findByText("You are offline. Changes need a connection.");
      fireEvent.click(within(dialog()).getByRole("button", { name: "Save meal" }));
      await act(async () => {});
      expect(saveAndLog).not.toHaveBeenCalled();
      expect(createSavedMeal).not.toHaveBeenCalled();
      expect(updateSavedMeal).not.toHaveBeenCalled();
    } finally {
      onLine.mockRestore();
    }
  });

  it("Save meal answers the meal to the log sheet and closes, logging nothing", async () => {
    jest.mocked(createSavedMeal).mockResolvedValue(bowl);
    const saveAndLog = jest.fn();
    const h = renderSheet({ actions: actions(saveAndLog) });
    fill();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(h.onClose).toHaveBeenCalledTimes(1));
    expect(h.onSavedMeal).toHaveBeenCalledWith(bowl);
    expect(h.onLogged).not.toHaveBeenCalled();
    expect(saveAndLog).not.toHaveBeenCalled();
  });

  it("refuses an empty figure and a source over 40 characters under their fields, and sends nothing", async () => {
    const saveAndLog = jest.fn();
    renderSheet({ actions: actions(saveAndLog) });
    fill();
    type("Fat", "");
    type("From (optional)", "x".repeat(41));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save and log" }));
    await act(async () => {});
    expect(saveAndLog).not.toHaveBeenCalled();
    expect(input("From (optional)")).toHaveAccessibleDescription("Use at most 40 characters.");
    expect(input("Fat")).toHaveAttribute("aria-invalid", "true");
    expect(input("From (optional)")).toHaveFocus();
  });

  it("describes every figure by the hint, and only the refused figures by a refusal", async () => {
    renderSheet();
    const hint = "Copy the figures from the label or menu.";
    expect(input("Carbohydrates").getAttribute("aria-describedby")).toBeTruthy();
    expect(input("Carbohydrates")).toHaveAccessibleDescription(expect.stringContaining(hint));
    fill();
    type("Protein", "");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save and log" }));
    await act(async () => {});
    expect(input("Protein")).toHaveAttribute("aria-invalid", "true");
    expect(input("Protein")).toHaveAccessibleDescription(expect.stringContaining("Enter a value."));
    expect(input("Carbohydrates")).not.toHaveAttribute("aria-invalid");
    expect(input("Carbohydrates")).not.toHaveAccessibleDescription(expect.stringContaining("Enter a value."));
  });

  it("opens an edit on the meal's own values, with no state choice, and saves with Save meal", async () => {
    jest.mocked(updateSavedMeal).mockResolvedValue({ ...bowl, name: "Chicken bowl, large" });
    const h = renderSheet({ meal: bowl, initialName: bowl.name });
    expect(screen.getByRole("dialog", { name: "Edit saved meal" })).toBeInTheDocument();
    expect(input("From (optional)").value).toBe("Wolt");
    expect(input("Fat").value).toBe("22.5");
    expect(within(dialog()).queryByRole("radiogroup")).toBeNull();
    expect(within(dialog()).queryByRole("button", { name: "Save and log" })).toBeNull();
    type("Name", "Chicken bowl, large");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(h.onClose).toHaveBeenCalledTimes(1));
    expect(updateSavedMeal).toHaveBeenCalledWith(bowl.id, {
      name: "Chicken bowl, large",
      source: "Wolt",
      figures: bowl.figures,
    });
    expect(h.onSavedMeal).toHaveBeenCalledWith(expect.objectContaining({ name: "Chicken bowl, large" }));
  });

  it("an edit of a meal that is gone hands it to the log sheet", async () => {
    jest.mocked(updateSavedMeal).mockRejectedValue(
      Object.assign(new Error("404"), {
        isAxiosError: true,
        response: { status: 404, data: { code: "saved_meal_not_found" } },
      }),
    );
    const h = renderSheet({ meal: bowl, initialName: bowl.name });
    type("Name", "Other");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save meal" }));
    await waitFor(() => expect(h.onGone).toHaveBeenCalledWith(bowl.id));
  });
});

describe("SavedMealSheet, layout from md", () => {
  const LONG = "Lähikahvila Mustikkamäen Kulmakeittiö";
  const group = (): HTMLElement => {
    // The smallest element holding both Name and From.
    let node: HTMLElement = input("Name");
    while (!node.contains(input("From (optional)"))) node = node.parentElement!;
    return node;
  };
  const child = (el: HTMLElement): HTMLElement => {
    let node = el;
    while (node.parentElement !== group()) node = node.parentElement!;
    return node;
  };

  it("gives an edit's Name and From the full width, one under the other, as a new meal's From has", () => {
    renderSheet({ meal: bowl, initialName: bowl.name, sources: [LONG, "Wolt"] });
    const tokens = group().className.split(" ");
    expect(tokens).not.toContain("md:grid");
    expect(tokens).not.toContain("md:grid-cols-2");
    expect(child(input("From (optional)")).className.split(" ")).toContain("md:col-span-2");
  });

  it("keeps a new meal's choice beside Name, with From across the width", () => {
    renderSheet({ sources: [LONG, "Wolt"] });
    expect(group().className.split(" ")).toEqual(expect.arrayContaining(["md:grid", "md:grid-cols-2"]));
    expect(child(input("From (optional)")).className.split(" ")).toContain("md:col-span-2");
  });

  it("cuts a source chip longer than its row at the row's width", () => {
    renderSheet({ meal: bowl, initialName: bowl.name, sources: [LONG, "Wolt"] });
    const chip = within(within(dialog()).getByRole("group", { name: "Your sources" })).getByRole("button", {
      name: LONG,
    });
    expect(chip.className.split(" ")).toEqual(expect.arrayContaining(["max-w-full", "truncate"]));
  });
});
