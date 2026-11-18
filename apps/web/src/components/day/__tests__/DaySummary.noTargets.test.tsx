import { formatDay } from "@/lib/localDate";
import { fireEvent, render, screen } from "@testing-library/react";
import { DaySummary } from "../DaySummary";
import { dayOf, estimateEntry, foodEntry, TODAY } from "./support";

// A day without targets: a day before the user's first change. Both readings
// as figures only, no gauge, no range and no distance, and one row where the
// gauges were that says from when the targets apply.

const FIRST = "2026-11-20";
const from = { kind: "from", date: FIRST } as const;
const squash = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();
/** What an element shows: no invisible form that keeps a line's room, and no visually hidden text. */
function shownText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll("[data-reserved] > [aria-hidden], .sr-only")) hidden.remove();
  return squash(copy.textContent);
}
const cells = (macro: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-summary-macro="${macro}"] [data-reading]`)].map(shownText);
/** Which of the rows that set the summary's height are there: each one's count, in order. */
const rows = () =>
  ["[data-gauge]", "[data-distance]", "[data-reserved]", "[data-targets-row]", "[data-note]"].map(
    (selector) => [selector, document.querySelectorAll(selector).length] as const,
  );

describe("DaySummary, a day without targets", () => {
  it("shows both readings as figures only: no gauge, no range and no distance, in either reading", () => {
    const planned = foodEntry("Rice", 300, { status: "planned" });
    const day = dayOf([foodEntry("Quark", 250), planned], TODAY, TODAY, null);
    render(<DaySummary date={TODAY} day={day} past={false} noTargets={from} />);
    expect(document.querySelector("[data-gauge]")).toBeNull();
    expect(document.querySelector("[data-distance]")).toBeNull();
    const summary = document.querySelector("[data-day-summary]")!;
    expect(summary.textContent).not.toMatch(/range|floor|upper bound|to \d/);
    // Both readings, never one figure for the two.
    expect(cells("energy")).toEqual(["148 kcal", "326 kcal"]);
    expect(cells("protein")).toEqual(["31.1 g", "68.4 g"]);
    expect(cells("carbs")).toEqual(["9 g", "19.8 g"]);
    // The labels stay, so the blocks still read as Calories and Protein.
    expect(screen.getByRole("region", { name: "Calories" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Protein" })).toBeInTheDocument();
  });

  it("says from when the targets apply, in one row between protein and the small figures", () => {
    render(<DaySummary date={TODAY} day={dayOf([], TODAY, TODAY, null)} past={false} noTargets={from} />);
    const row = document.querySelector<HTMLElement>("[data-targets-row]")!;
    expect(row).toHaveAttribute("data-targets-row", "from");
    expect(row).toHaveTextContent(`Targets apply from ${formatDay(FIRST)}.`);
    // No control: a plain line in muted ink.
    expect(row.querySelector("button, a")).toBeNull();
    expect(row.className.split(/\s+/)).toEqual(expect.arrayContaining(["mt-3", "text-ink-muted"]));
    const protein = document.querySelector('[data-summary-macro="protein"]')!;
    expect(protein.parentElement!.nextElementSibling).toBe(row);
    expect(row.nextElementSibling!.querySelector('[data-summary-macro="carbs"]')).not.toBeNull();
  });

  it("keeps the estimate note and the planned entries line", () => {
    const yesterday = "2026-11-15";
    const dinner = estimateEntry("Restaurant dinner", { energyKcal: 900, proteinG: 40, carbsG: 80, fatG: 35 });
    const planned = foodEntry("Rice", 300, { status: "planned" });
    render(
      <DaySummary date={yesterday} day={dayOf([dinner, planned], yesterday, TODAY, null)} past noTargets={from} />,
    );
    expect(document.querySelector('[data-note="estimate"]')).toHaveTextContent("These totals include an estimate.");
    expect(document.querySelector('[data-note="unmarked"]')).toHaveTextContent(
      "1 planned entry was never marked eaten.",
    );
    expect(cells("energy")).toEqual(["≈900 kcal", "≈1078 kcal"]);
  });

  it("lays out the frame with the same rows as the loaded day, and keeps them through a mark and an add", () => {
    const quark = foodEntry("Quark", 250, { status: "planned" });
    const { rerender } = render(<DaySummary date={TODAY} day={null} past noTargets={from} />);
    const frame = rows();
    // The frame already knows: no gauge track, and the line in its place.
    expect(document.querySelector('[data-gauge="frame"]')).toBeNull();
    expect(document.querySelector("[data-targets-row]")).toHaveTextContent(`Targets apply from ${formatDay(FIRST)}.`);

    rerender(<DaySummary date={TODAY} day={dayOf([quark], TODAY, TODAY, null)} past noTargets={from} />);
    expect(rows()).toEqual(frame);
    rerender(
      <DaySummary
        date={TODAY}
        day={dayOf([{ ...quark, status: "eaten" }], TODAY, TODAY, null)}
        past
        noTargets={from}
      />,
    );
    expect(rows()).toEqual(frame);
    const added = estimateEntry("Cake", { energyKcal: 400, proteinG: 5, carbsG: 50, fatG: 20 });
    rerender(
      <DaySummary
        date={TODAY}
        day={dayOf([{ ...quark, status: "eaten" }, added], TODAY, TODAY, null)}
        past
        noTargets={from}
      />,
    );
    expect(rows()).toEqual(frame);
  });

  it("holds the line's room empty while the start date is not known yet", () => {
    const { rerender } = render(
      <DaySummary date={TODAY} day={dayOf([], TODAY, TODAY, null)} past={false} noTargets={{ kind: "pending" }} />,
    );
    const pending = document.querySelector<HTMLElement>("[data-targets-row]")!;
    expect(pending).toHaveAttribute("data-targets-row", "pending");
    expect(pending.textContent).toBe("");
    const room = pending.className;
    expect(room.split(/\s+/)).toEqual(expect.arrayContaining(["min-h-4", "md:min-h-5"]));
    expect(document.querySelector("[data-gauge]")).toBeNull();

    // The same element, the same room, once the date is known.
    rerender(<DaySummary date={TODAY} day={dayOf([], TODAY, TODAY, null)} past={false} noTargets={from} />);
    const line = document.querySelector<HTMLElement>("[data-targets-row]")!;
    expect(line).toBe(pending);
    expect(line.className).toBe(room);
  });

  it("leaves no empty paragraph for assistive technology, and hides none that has text", () => {
    /** Each paragraph in the summary: its text, and whether assistive technology can reach it. */
    const paragraphs = () =>
      [...document.querySelectorAll("[data-day-summary] p")].map((p) => [
        squash(p.textContent),
        p.closest('[aria-hidden="true"]') === null,
      ]);
    const empty = (list: ReturnType<typeof paragraphs>) => list.filter(([text]) => text === "");
    const noTargetsDay = dayOf([foodEntry("Quark", 250)], TODAY, TODAY, null);
    const { rerender } = render(<DaySummary date={TODAY} day={null} past={false} noTargets={{ kind: "pending" }} />);
    // The frame, the room while the start date is not known, and the line once it is.
    for (const [day, noTargets] of [
      [null, { kind: "pending" }],
      [noTargetsDay, { kind: "pending" }],
      [noTargetsDay, from],
    ] as const) {
      rerender(<DaySummary date={TODAY} day={day} past={false} noTargets={noTargets} />);
      const list = paragraphs();
      expect(empty(list).length).toBeGreaterThan(0);
      expect(empty(list).filter(([, reached]) => reached)).toEqual([]);
    }
    expect(paragraphs()).toContainEqual([`Targets apply from ${formatDay(FIRST)}.`, true]);
    // A day with targets: both ranges are there and read.
    rerender(<DaySummary date={TODAY} day={dayOf([foodEntry("Quark", 250)])} past={false} />);
    expect(paragraphs().filter(([text]) => /^\d.* to .*(kcal|g)$/.test(String(text)))).toEqual([
      [expect.any(String), true],
      [expect.any(String), true],
    ]);
  });

  it("shows no such row on a day with targets", () => {
    render(<DaySummary date={TODAY} day={dayOf([foodEntry("Quark", 250)])} past={false} />);
    expect(document.querySelector("[data-targets-row]")).toBeNull();
    expect(document.querySelectorAll('[data-gauge="energy"], [data-gauge="protein"]')).toHaveLength(2);
    expect(document.querySelectorAll("[data-distance]")).toHaveLength(4);
  });

  describe("for a user with no targets at all", () => {
    const none = { kind: "none" } as const;
    const row = () => document.querySelector<HTMLElement>("[data-targets-row]")!;

    it("holds one plain Set targets button where the gauges were, and pressing it asks for the first-run page", () => {
      const onSetTargets = jest.fn();
      render(
        <DaySummary
          date={TODAY}
          day={dayOf([foodEntry("Quark", 250)], TODAY, TODAY, null)}
          past={false}
          noTargets={none}
          onSetTargets={onSetTargets}
        />,
      );
      expect(row()).toHaveAttribute("data-targets-row", "none");
      const protein = document.querySelector('[data-summary-macro="protein"]')!;
      expect(protein.parentElement!.nextElementSibling).toBe(row());
      const button = screen.getByRole("button", { name: "Set targets" });
      expect(row()).toContainElement(button);
      expect(row().textContent).toBe("Set targets");
      // A button, not a link: it changes what the app shows, not the address.
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveAttribute("type", "button");
      expect(row().querySelector("a, svg, img")).toBeNull();
      expect(document.querySelector("[data-gauge]")).toBeNull();
      expect(document.querySelector("[data-distance]")).toBeNull();
      fireEvent.click(button);
      expect(onSetTargets).toHaveBeenCalledTimes(1);
    });

    it("is ink and underlined with a 44 pixel target: no accent, no fill, no warning colour", () => {
      render(<DaySummary date={TODAY} day={dayOf([], TODAY, TODAY, null)} past={false} noTargets={none} />);
      const tokens = screen.getByRole("button", { name: "Set targets" }).className.split(/\s+/);
      expect(tokens).toEqual(expect.arrayContaining(["text-ink", "underline", "min-h-11"]));
      expect(tokens.filter((c) => /accent|warning|^bg-|^border-/.test(c) && !c.startsWith("decoration-"))).toEqual([]);
      expect(row().className.split(/\s+/)).toContain("mt-3");
    });

    it("is the same row on every day and whatever the entries: 0, 1 and 8, today, past and future", () => {
      const markups: string[] = [];
      const entries = (n: number, date: string) =>
        Array.from({ length: n }, (_, i) => foodEntry(`Food ${i}`, 100 + i, { date }));
      for (const date of ["2026-11-02", "2026-11-15", TODAY, "2026-11-17", "2026-12-24"]) {
        for (const n of [0, 1, 8]) {
          const { unmount } = render(
            <DaySummary
              date={date}
              day={dayOf(entries(n, date), date, TODAY, null)}
              past={date < TODAY}
              noTargets={none}
            />,
          );
          markups.push(row().outerHTML);
          expect(row().textContent).toBe("Set targets");
          unmount();
        }
      }
      expect(new Set(markups).size).toBe(1);
    });

    it("lays out the frame with the same rows and the same button as the loaded day", () => {
      const { rerender } = render(<DaySummary date={TODAY} day={null} past noTargets={none} />);
      const frame = rows();
      const button = screen.getByRole("button", { name: "Set targets" });
      expect(document.querySelector('[data-gauge="frame"]')).toBeNull();
      rerender(
        <DaySummary date={TODAY} day={dayOf([foodEntry("Quark", 250)], TODAY, TODAY, null)} past noTargets={none} />,
      );
      expect(rows()).toEqual(frame);
      expect(screen.getByRole("button", { name: "Set targets" })).toBe(button);
    });
  });
});
