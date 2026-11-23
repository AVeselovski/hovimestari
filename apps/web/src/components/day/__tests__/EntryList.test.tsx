import { clockFrom } from "@/__tests__/helpers/clock";
import { dayEntriesActions } from "@/components/ui/styles";
import type { EntryActions } from "@/hooks/useEntryActions";
import type { Entry } from "@hovimestari/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { EntryList } from "../EntryList";
import { TODAY, dayOf, fakeEntryActions, foodEntry, recipeEntry } from "./support";

// ---------------------------------------------------------------------------
// The "Entries" row's actions: Mark all eaten and Copy. Copy must not move
// when Mark all eaten leaves, so it is the last control of one group that
// sits at the row's end. jsdom lays nothing out, so this pins the structure
// that keeps its place: the same node, last in the same group, at the end of
// a `justify-between` row. The x itself is measured in a real browser.
// ---------------------------------------------------------------------------

const head = () => document.querySelector<HTMLElement>("[data-entries-head]")!;
const copy = () => screen.getByRole("button", { name: "Copy" });
const tokens = (el: Element) => el.className.split(/\s+/);

function list(entries: Entry[], overrides: { future?: boolean; actions?: EntryActions; onCopy?: jest.Mock } = {}) {
  return (
    <EntryList
      entries={entries}
      future={overrides.future ?? false}
      actions={overrides.actions ?? fakeEntryActions()}
      onOpen={jest.fn()}
      onCopy={overrides.onCopy ?? jest.fn()}
    />
  );
}

describe("EntryList, Copy", () => {
  it("stays the same node, last in the group at the row's end, before and after Mark all eaten leaves", () => {
    const planned = [foodEntry("Oats", 80, { status: "planned" }), foodEntry("Quark", 250, { status: "planned" })];
    const { rerender } = render(list(planned));
    const before = copy();
    const group = before.parentElement!;
    expect(screen.getByRole("button", { name: "Mark all eaten" }).parentElement).toBe(group);
    expect(group.lastElementChild).toBe(before);
    expect(head().lastElementChild).toBe(group);
    expect(tokens(head())).toContain("justify-between");

    // Marked: Mark all eaten leaves the row.
    rerender(list(planned.map((e) => ({ ...e, status: "eaten" as const }))));
    expect(screen.queryByRole("button", { name: "Mark all eaten" })).toBeNull();
    expect(copy()).toBe(before);
    expect(copy().parentElement).toBe(group);
    expect(group.lastElementChild).toBe(before);
    expect(head().lastElementChild).toBe(group);
  });

  it("keeps a 44px press target that grows leftward, so its words stay at the row's end", () => {
    render(list([foodEntry("Oats", 80, { status: "planned" })]));
    expect(tokens(copy())).toEqual(expect.arrayContaining(["min-h-11", "min-w-11", "justify-end"]));
    // The group is the shared recipe, not classes of its own.
    expect(copy().parentElement!.className).toBe(dayEntriesActions);
  });

  it("shows on a future day with planned entries, where Mark all eaten does not", () => {
    render(list([foodEntry("Oats", 80, { status: "planned" })], { future: true }));
    expect(copy()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all eaten" })).toBeNull();
  });

  it("does not show on an empty day or while the day loads", () => {
    const { rerender } = render(list([]));
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    rerender(
      <EntryList entries={null} future={false} actions={fakeEntryActions()} onOpen={jest.fn()} onCopy={jest.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });

  it("opens the sheet with itself as the opener, and waits while the app asks for today", () => {
    const onCopy = jest.fn();
    const { rerender } = render(list([foodEntry("Oats", 80)], { onCopy }));
    fireEvent.click(copy());
    expect(onCopy).toHaveBeenCalledWith(copy());

    onCopy.mockClear();
    rerender(list([foodEntry("Oats", 80)], { onCopy, actions: fakeEntryActions({ holding: true }) }));
    expect(copy()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(copy());
    expect(onCopy).not.toHaveBeenCalled();
  });
});

describe("EntryList, a recipe entry's row", () => {
  beforeEach(() => clockFrom(`${TODAY}T12:00:00Z`));
  afterEach(() => jest.restoreAllMocks());

  it("reads its servings as its amount, one serving and a part of one", () => {
    const serving = { energyKcal: 365.1, proteinG: 21.78, carbsG: 9.87, fatG: 25.69 };
    const { entries } = dayOf([recipeEntry("Shakshuka", 1, serving), recipeEntry("Lentil soup", 1.5, serving)]);
    render(list(entries));
    expect(screen.getByText("1 serving")).toBeInTheDocument();
    expect(screen.getByText("1.5 servings")).toBeInTheDocument();
  });

  it("says as made on a serving of a batch only while the server says the batch differs from its recipe", () => {
    const batch = { energyKcal: 240.53, proteinG: 17.187, carbsG: 8.087, fatG: 15.073 };
    const cook = { id: "00000000-0000-4000-9000-00000000c00c", date: TODAY, servings: 3 };
    const { entries } = dayOf([
      recipeEntry("Shakshuka", 2, batch, { cook: { ...cook, differs: true } }),
      recipeEntry("Lentil soup", 1.5, batch, { cook: { ...cook, differs: false } }),
      recipeEntry("Pea soup", 1, batch),
    ]);
    render(list(entries));
    const meta = (name: string) => screen.getByText(name).nextElementSibling?.textContent;
    // Said once, in the amount line, and the figures are the batch's.
    expect(meta("Shakshuka")).toBe("2 servings as made");
    expect(document.querySelectorAll("li")[0].textContent?.match(/as made/g)).toHaveLength(1);
    expect(document.body.textContent).toContain("481");
    // A batch made as written reads as a plain serving does.
    expect(meta("Lentil soup")).toBe("1.5 servings");
    expect(meta("Pea soup")).toBe("1 serving");
  });
});
