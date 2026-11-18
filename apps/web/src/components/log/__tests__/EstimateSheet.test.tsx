import { describeFormSheetContract } from "@/__tests__/formSheet";
import { deferred } from "@/__tests__/helpers/queryClient";
import type { AddDone, AddRequest } from "@/hooks/entryActions";
import { TodayContext, type TodayState } from "@/hooks/useToday";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EstimateSheet, type EstimateSheetProps } from "../EstimateSheet";

// The estimate sheet on its own: its fields, what Save estimate sends, and
// the form sheet contract. The log sheet suites run it stacked on the log
// sheet against the fake server.

const DATE = "2026-11-16";
let add = jest.fn();
beforeEach(() => {
  add = jest.fn();
});

function renderSheet(props: Partial<EstimateSheetProps> = {}) {
  const handlers = { onClose: jest.fn(), onSaved: jest.fn(), onLogged: jest.fn() };
  render(
    <EstimateSheet
      open
      returnFocusTo={null}
      initialName=""
      date={DATE}
      actions={{ add: (r) => add(r), holding: false }}
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
  type("Name", "Restaurant dinner");
  type("Calories", "900");
  type("Protein", "45");
  type("Carbohydrates", "80");
  type("Fat", "40");
}
const timeout = () => Object.assign(new Error("timeout"), { isAxiosError: true, code: "ECONNABORTED" });

describe("EstimateSheet", () => {
  describeFormSheetContract({
    name: /^add an estimate$/i,
    panelClass: "md:max-w-lg",
    renderSheet: (p) => (
      <EstimateSheet
        {...p}
        initialName=""
        date={DATE}
        actions={{ add: (r) => add(r), holding: false }}
        onLogged={jest.fn()}
      />
    ),
    type: () => type("Name", "Dinner"),
    typedField: () => input("Name"),
    fillValid: fill,
    holdSave: () => {
      const held = deferred<AddDone>();
      add.mockReturnValue(held.promise);
      return {
        resolve: () => held.resolve({ outcome: "created", announce: jest.fn() }),
        reject: () => held.reject(new Error("refused")),
      };
    },
    firstField: () => input("Name"),
    saveName: /^save estimate$/i,
  });

  it("says what it is for, and starts from a name the search typed", () => {
    renderSheet({ initialName: "Pizza night" });
    expect(dialog()).toHaveAccessibleDescription("For a meal you cannot weigh, such as a restaurant dinner.");
    expect(input("Name").value).toBe("Pizza night");
  });

  it("logs the estimate to the sheet's date with an id made at open, kept across a retry after a timeout", async () => {
    const done: AddDone = { outcome: "created", announce: jest.fn() };
    add.mockRejectedValueOnce(timeout()).mockResolvedValueOnce(done);
    const h = renderSheet();
    fill();
    type("Note (optional)", "Two courses");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save estimate" }));
    await within(dialog()).findByText("Could not confirm. Check your connection and try again.");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save estimate" }));
    await waitFor(() => expect(h.onClose).toHaveBeenCalledTimes(1));
    const [first, second] = add.mock.calls.map(([r]: [AddRequest]) => r.body);
    expect(first).toEqual({
      kind: "estimate",
      id: expect.any(String),
      date: DATE,
      status: "eaten",
      name: "Restaurant dinner",
      figures: { energyKcal: 900, proteinG: 45, carbsG: 80, fatG: 40 },
      note: "Two courses",
    });
    expect(second.id).toBe(first.id);
    expect(h.onLogged).toHaveBeenCalledWith(done);
  });

  it("on a day after today plans the estimate: Eaten cannot be chosen and it sends planned", async () => {
    const today: TodayState = {
      today: "2026-11-15",
      holding: false,
      confirm: "fresh",
      unconfirmed: false,
      retry: jest.fn(),
    };
    add.mockResolvedValue({ outcome: "created", announce: jest.fn() });
    render(
      <TodayContext.Provider value={today}>
        <EstimateSheet
          open
          returnFocusTo={null}
          initialName=""
          date={DATE}
          actions={{ add: (r) => add(r), holding: false }}
          onClose={jest.fn()}
          onLogged={jest.fn()}
        />
      </TodayContext.Provider>,
    );
    expect(within(dialog()).getByRole("radio", { name: "Eaten" })).toHaveAttribute("aria-disabled", "true");
    fill();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save estimate" }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(1));
    expect((add.mock.calls[0][0] as AddRequest).body).toMatchObject({ date: DATE, status: "planned" });
  });

  it("refuses each field under it and focuses the first, sending nothing", async () => {
    renderSheet();
    type("Calories", "1,500");
    fireEvent.click(within(dialog()).getByRole("button", { name: "Save estimate" }));
    await waitFor(() => expect(input("Name")).toHaveFocus());
    expect(input("Name")).toHaveAccessibleDescription("Give it a name.");
    expect(input("Calories")).toHaveAccessibleDescription(/No comma or point, or fewer decimals\./);
    expect(add).not.toHaveBeenCalled();
  });
});
