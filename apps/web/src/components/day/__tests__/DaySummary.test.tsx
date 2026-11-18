import { render, screen } from "@testing-library/react";
import { DaySummary } from "../DaySummary";
import { dayOf, estimateEntry, foodEntry, RANGES, TODAY } from "./support";

const part = (macro: string, name: string) =>
  document.querySelector<HTMLElement>(`[data-gauge="${macro}"] [data-gauge-part="${name}"]`);
/** Where the band and both ticks sit, as the styles place them. */
const fixedParts = () =>
  (["energy", "protein"] as const).map((m) => ({
    band: [part(m, "band")!.style.left, part(m, "band")!.style.width],
    ticks: [part(m, "tick-lower")!.style.left, part(m, "tick-upper")!.style.left],
  }));
const squash = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();
/** What an element shows: no invisible form that keeps a line's room, and no visually hidden text. */
function shownText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll("[data-reserved] > [aria-hidden], .sr-only")) hidden.remove();
  return squash(copy.textContent);
}
/** What a screen reader reads from an element: nothing marked aria-hidden. */
function spokenText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return squash(copy.textContent);
}
const readings = (macro: string) => [
  ...document.querySelectorAll<HTMLElement>(`[data-summary-macro="${macro}"] [data-reading]`),
];
const cells = (macro: string) => readings(macro).map(shownText);
const spokenCells = (macro: string) => readings(macro).map(spokenText);
/** Every reserved line's forms: what keeps its room, whatever it holds. */
const reservedForms = () =>
  [...document.querySelectorAll("[data-reserved]")].map((r) =>
    [...r.querySelectorAll(':scope > [aria-hidden="true"]')].map((f) => f.textContent),
  );

describe("DaySummary", () => {
  it("keeps the band and the ticks where they are as a planned entry past 125 % is added, marked eaten and removed", () => {
    const breakfast = foodEntry("Quark", 400);
    const { rerender } = render(<DaySummary date={TODAY} day={dayOf([breakfast])} past={false} />);
    const before = fixedParts();
    const reservedBefore = reservedForms();

    const feast = foodEntry("Feast", 5000, {
      status: "planned",
      basis: { energyKcal: 80, proteinG: 4, carbsG: 9, fatG: 3 },
    });
    rerender(<DaySummary date={TODAY} day={dayOf([breakfast, feast])} past={false} />);
    expect(part("energy", "cap")).toHaveAttribute("data-cap", "plan");
    expect(fixedParts()).toEqual(before);

    rerender(<DaySummary date={TODAY} day={dayOf([breakfast, { ...feast, status: "eaten" }])} past={false} />);
    expect(part("energy", "cap")).toHaveAttribute("data-cap", "eaten");
    // A 1 px edge of the page colour on its inner side sets it apart from the fill of its own hue.
    expect(part("energy", "cap")!.className.split(" ")).toEqual(expect.arrayContaining(["border-l", "border-bg"]));
    expect(fixedParts()).toEqual(before);

    rerender(<DaySummary date={TODAY} day={dayOf([breakfast])} past={false} />);
    expect(part("energy", "cap")).toBeNull();
    expect(fixedParts()).toEqual(before);
    // The summary's lines keep the same room in every state.
    expect(reservedForms()).toEqual(reservedBefore);
  });

  it("keeps the same reserved room for every line as an estimate is added, undone and removed", () => {
    const quark = foodEntry("Quark", 250);
    const dinner = estimateEntry("Restaurant dinner", { energyKcal: 900, proteinG: 40, carbsG: 80, fatG: 35 });
    const { rerender } = render(<DaySummary date={TODAY} day={dayOf([quark])} past />);
    const forms = reservedForms();
    // Six lines keep their room: four distances, the estimate note and the unmarked note.
    expect(forms).toHaveLength(6);
    expect(forms.every((f) => f.length > 0)).toBe(true);
    // Each distance keeps the room of its macro's three shown forms at the longest distance, in both columns.
    const energy = [
      "8888.8\u00a0kcal below the range",
      "8888.8\u00a0kcal to the upper bound",
      "8888.8\u00a0kcal above the range",
    ];
    const protein = [
      "8888.8\u00a0g below the floor",
      "8888.8\u00a0g to the upper bound",
      "8888.8\u00a0g above the range",
    ];
    expect(forms.slice(0, 4)).toEqual([energy, energy, protein, protein]);
    expect(forms[4]).toEqual(["These totals include an estimate.", "Planned entries include an estimate."]);
    const note = () => document.querySelector('[data-note="estimate"]')!.textContent;
    expect(note()).toBe("");

    rerender(<DaySummary date={TODAY} day={dayOf([quark, dinner])} past />);
    expect(note()).toBe("These totals include an estimate.");
    expect(reservedForms()).toEqual(forms);

    rerender(<DaySummary date={TODAY} day={dayOf([quark, { ...dinner, status: "planned" }])} past />);
    expect(note()).toBe("Planned entries include an estimate.");
    expect(reservedForms()).toEqual(forms);

    rerender(<DaySummary date={TODAY} day={dayOf([quark])} past />);
    expect(note()).toBe("");
    expect(reservedForms()).toEqual(forms);
  });

  it("draws both columns with equal figures when nothing is planned", () => {
    render(<DaySummary date={TODAY} day={dayOf([foodEntry("Quark", 250)])} past={false} />);
    const [eaten, withPlan] = cells("energy");
    expect(eaten).toBe("148 kcal1752 kcal below the range");
    expect(withPlan).toBe(eaten);
    expect(spokenCells("energy")).toEqual([
      "Eaten148 kcal1752 kcal below the range",
      "With plan148 kcal1752 kcal below the range",
    ]);
    expect(cells("protein")[0]).toBe(cells("protein")[1]);
    expect(part("energy", "plan")).toBeNull();
  });

  it("shows zeros in a future day's Eaten column, and the plan beside them", () => {
    const tomorrow = "2026-11-17";
    const planned = foodEntry("Quark", 250, { status: "planned" });
    render(<DaySummary date={tomorrow} day={dayOf([planned], tomorrow)} past={false} />);
    expect(cells("energy")).toEqual(["0 kcal1900 kcal below the range", "148 kcal1752 kcal below the range"]);
    expect(cells("carbs")).toEqual(["0 g", "9 g"]);
    expect(spokenCells("carbs")).toEqual(["Eaten 0 g", "With plan 9 g"]);
    expect(part("energy", "eaten")).toBeNull();
    expect(part("energy", "plan")).toHaveClass("rounded-l-pill");
  });

  it("states each distance by its position, with its decimal when it has one", () => {
    const at = (kcal: number, protein: number) =>
      foodEntry("Mixed", 100, { basis: { energyKcal: kcal, proteinG: protein, carbsG: 0, fatG: 0 } });
    // A range bound with a decimal gives a distance with one: 959.5 kcal from 1899.5 kcal.
    const halfway = dayOf([at(940, 20)]);
    for (const reading of [halfway.eaten, halfway.withPlan]) reading.energy = { position: "below", distance: 959.5 };
    const { rerender } = render(<DaySummary date={TODAY} day={halfway} past={false} />);
    const distances = () => [...document.querySelectorAll("[data-distance]")].map((d) => d.textContent);
    expect(distances()).toEqual([
      "959.5\u00a0kcal below the range",
      "959.5\u00a0kcal below the range",
      "120\u00a0g below the floor",
      "120\u00a0g below the floor",
    ]);
    // 120.0 reads as 120.
    expect(halfway.eaten.protein).toEqual({ position: "below", distance: 120 });
    rerender(<DaySummary date={TODAY} day={dayOf([at(2000, 150)])} past={false} />);
    // Within the range the line shows the distance alone, and says "In the range" aloud.
    expect(distances()).toEqual([
      "200\u00a0kcal to the upper bound",
      "200\u00a0kcal to the upper bound",
      "30\u00a0g to the upper bound",
      "30\u00a0g to the upper bound",
    ]);
    expect(spokenCells("energy")).toEqual([
      "Eaten2000 kcalIn the range, 200 kcal to the upper bound",
      "With plan2000 kcalIn the range, 200 kcal to the upper bound",
    ]);
    expect(spokenCells("protein")[0]).toBe("Eaten150 gIn the range, 30 g to the upper bound");
    rerender(<DaySummary date={TODAY} day={dayOf([at(2300, 200.4)])} past={false} />);
    expect(distances()).toEqual([
      "100\u00a0kcal above the range",
      "100\u00a0kcal above the range",
      "20.4\u00a0g above the range",
      "20.4\u00a0g above the range",
    ]);
  });

  it("reads each macro's label, range, then each reading's figure and distance, and hides the gauge", () => {
    const dinner = estimateEntry("Restaurant dinner", { energyKcal: 900, proteinG: 40, carbsG: 80, fatG: 35 });
    render(<DaySummary date={TODAY} day={dayOf([dinner])} past={false} />);
    const calories = screen.getByRole("region", { name: "Calories" });
    expect(spokenText(calories)).toBe(
      "Calories1900 to 2200 kcalEatenestimated 900 kcal1000 kcal below the rangeWith planestimated 900 kcal1000 kcal below the range",
    );
    expect(shownText(calories)).toBe(
      "Calories1900 to 2200 kcal≈900 kcal1000 kcal below the range≈900 kcal1000 kcal below the range",
    );
    expect(document.querySelector('[data-gauge="energy"]')).toHaveAttribute("aria-hidden", "true");
  });

  it("says how many planned entries a past day never had marked eaten, in a line whose room is kept", () => {
    const yesterday = "2026-11-15";
    const planned = [foodEntry("A", 100, { status: "planned" }), foodEntry("B", 100, { status: "planned" })];
    render(<DaySummary date={yesterday} day={dayOf(planned, yesterday)} past />);
    expect(document.querySelector('[data-note="unmarked"]')).toHaveTextContent(
      "2 planned entries were never marked eaten.",
    );
  });

  it("colours only the fills, the plan segment and the end-cap: no accent, and no hue on the band, the ticks or any text", () => {
    const planned = foodEntry("Feast", 5000, { status: "planned" });
    render(<DaySummary date={TODAY} day={dayOf([foodEntry("Quark", 400), planned])} past={false} />);
    for (const el of document.querySelectorAll("[data-gauge] *, [data-gauge]")) {
      const classes = el.getAttribute("class")?.split(/\s+/) ?? [];
      expect(classes.filter((c) => /accent/.test(c))).toEqual([]);
    }
    for (const name of ["track", "band", "tick-lower", "tick-upper"]) {
      const classes = part("energy", name)!.className.split(/\s+/);
      expect([name, classes.filter((c) => /energy|protein/.test(c))]).toEqual([name, []]);
    }
    for (const el of document.querySelectorAll("[data-distance], [data-reading]")) {
      expect(el.className).not.toMatch(/energy|protein|accent/);
    }
  });

  it("shows the frame while loading: empty tracks with no band and no ticks, and the range unknown", () => {
    render(<DaySummary date={TODAY} day={null} past={false} />);
    expect(document.querySelectorAll('[data-gauge="frame"]')).toHaveLength(2);
    expect(document.querySelector('[data-gauge-part="band"]')).toBeNull();
    expect(screen.queryByText(/to 2200 kcal/)).toBeNull();
    expect(RANGES.energyKcal.upper).toBe(2200);
    expect(cells("energy")).toEqual(["", ""]);
    expect(spokenCells("energy")).toEqual(["Eaten", "With plan"]);
  });

  it("shows carbohydrates and fat as a two-row table in the two columns, with both readings in every row", () => {
    const planned = foodEntry("Rice", 300, { status: "planned" });
    const { rerender } = render(
      <DaySummary date={TODAY} day={dayOf([foodEntry("Quark", 250), planned])} past={false} />,
    );
    const table = document.querySelector("[data-day-summary] dl:has([data-summary-macro='carbs'])")!;
    const rows = [...table.children];
    expect(rows.map((row) => row.getAttribute("data-summary-macro"))).toEqual(["carbs", "fat"]);
    for (const row of rows) {
      // One label and two figures in one row: the label is never a line of its own over the figures.
      expect(row.querySelectorAll("dt")).toHaveLength(1);
      expect([...row.querySelectorAll("dd")].map((dd) => dd.getAttribute("data-reading"))).toEqual([
        "eaten",
        "withPlan",
      ]);
      expect(row.querySelector("dt")!.className.split(/\s+/)).not.toContain("col-span-2");
    }
    // The label shows short and reads in full.
    expect(shownText(rows[0]!.querySelector("dt")!)).toBe("Carbs");
    expect(spokenText(rows[0]!.querySelector("dt")!)).toBe("Carbohydrates");
    expect(spokenText(rows[0]!)).toBe("CarbohydratesEaten 9 gWith plan 19.8 g");
    expect(cells("carbs")).toEqual(["9 g", "19.8 g"]);
    expect(cells("fat")).toEqual(["0.5 g", "1.1 g"]);

    // Nothing planned: still both readings, equal, never one figure for the two.
    rerender(<DaySummary date={TODAY} day={dayOf([foodEntry("Quark", 250)])} past={false} />);
    for (const macro of ["carbs", "fat"]) {
      const [eaten, withPlan] = cells(macro);
      expect(readings(macro)).toHaveLength(2);
      expect(eaten).not.toBe("");
      expect(withPlan).toBe(eaten);
    }
  });

  it("is busy while it loads, and not once the day or a notice is there", () => {
    const { rerender } = render(<DaySummary date={TODAY} day={null} past={false} />);
    const summary = document.querySelector("[data-day-summary]")!;
    expect(summary).toHaveAttribute("aria-busy", "true");
    rerender(<DaySummary date={TODAY} day={dayOf([foodEntry("Quark", 250)])} past={false} />);
    expect(summary).not.toHaveAttribute("aria-busy");
    rerender(<DaySummary date={TODAY} day={null} past={false} notice={<p>Offline</p>} />);
    expect(summary).not.toHaveAttribute("aria-busy");
  });

  it("starts each small figure in its column: after the label's lead under Eaten, at the column's start under With plan", () => {
    render(<DaySummary date={TODAY} day={dayOf([foodEntry("Quark", 250)])} past={false} />);
    const [eaten, withPlan] = readings("carbs");
    expect(eaten.className.split(" ")).toEqual(expect.arrayContaining(["col-start-1", "ml-16", "justify-self-start"]));
    expect(withPlan.className.split(" ")).toEqual(expect.arrayContaining(["col-start-2", "justify-self-start"]));
    expect(withPlan.className.split(" ")).not.toContain("justify-self-end");
  });

  it("shows no column heads, and still names each reading for a screen reader", () => {
    const quark = foodEntry("Quark", 250);
    const later = foodEntry("Rahka", 200, { status: "planned" });
    const { container } = render(<DaySummary date={TODAY} day={dayOf([quark, later])} past={false} />);
    const summary = container.querySelector<HTMLElement>("[data-day-summary]")!;
    // Every "Eaten" and "With plan" on the summary is screen reader text: nothing visible says them.
    const visible = [...summary.querySelectorAll<HTMLElement>("*")].filter(
      (el) => el.children.length === 0 && /^(Eaten|With plan)$/.test(el.textContent!.trim()),
    );
    expect(visible.length).toBeGreaterThan(0);
    for (const el of visible) expect(el.closest(".sr-only")).not.toBeNull();
    // The calories block is the summary's first block: no row above it.
    const content = summary.firstElementChild!;
    expect(content.firstElementChild).toBe(summary.querySelector('[data-summary-macro="energy"]'));
    // Both readings are still there, side by side, and named.
    const energy = summary.querySelector('[data-summary-macro="energy"]')!;
    expect([...energy.querySelectorAll("[data-reading]")].map((r) => r.getAttribute("data-reading"))).toEqual([
      "eaten",
      "withPlan",
    ]);
    expect([...energy.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual(["Eaten", "With plan"]);
  });
});
