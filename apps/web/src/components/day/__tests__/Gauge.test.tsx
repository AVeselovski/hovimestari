import { render } from "@testing-library/react";
import { AverageGauge, Gauge, GaugeFrame, type GaugeSize } from "../Gauge";

// ---------------------------------------------------------------------------
// The gauge and its loading frame read one size record, so a loading row and
// a loaded row are the same height, and each size's track steps from the
// colour it sits on: the page for the Day, the sheet's surface for a week.
// ---------------------------------------------------------------------------

const classes = (el: Element | null): string[] => (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);

/** The classes that set a height: the frame's padding and the track's `h-*`, with their variants. */
const heightClasses = (el: Element | null): string[] =>
  classes(el)
    .filter((c) => /^(?:md:)?(?:h-|py-)/.test(c))
    .sort();

function parts(size: GaugeSize): { frame: Element; track: Element; loadingFrame: Element; loadingTrack: Element } {
  const { container: loaded } = render(
    <Gauge size={size} macro="energy" range={{ lower: 1900, upper: 2200 }} eaten={800} withPlan={1500} />,
  );
  const { container: loading } = render(<GaugeFrame size={size} />);
  const frame = loaded.querySelector("[data-gauge]")!;
  const loadingFrame = loading.querySelector('[data-gauge="frame"]')!;
  return {
    frame,
    track: frame.querySelector('[data-gauge-part="track"]')!,
    loadingFrame,
    loadingTrack: loadingFrame.firstElementChild!,
  };
}

describe("Gauge and GaugeFrame", () => {
  it.each(["day", "mini"] as const)("give the %s frame the gauge's own height", (size) => {
    const p = parts(size);
    expect(heightClasses(p.loadingFrame)).toEqual(heightClasses(p.frame));
    expect(heightClasses(p.loadingTrack)).toEqual(heightClasses(p.track));
    expect(heightClasses(p.track).length).toBeGreaterThan(0);
  });

  it("draws a week row's track, loaded or loading, in the on-surface track colour, and the Day's in the page's", () => {
    const mini = parts("mini");
    expect(classes(mini.track)).toContain("bg-gauge-track-on-surface");
    expect(classes(mini.loadingTrack)).toContain("bg-gauge-track-on-surface");
    const day = parts("day");
    expect(classes(day.track)).toContain("bg-gauge-track");
    expect(classes(day.loadingTrack)).toContain("bg-gauge-track");
    expect(classes(day.track)).not.toContain("bg-gauge-track-on-surface");
  });
});

describe("AverageGauge", () => {
  const RANGE = { lower: 1900, upper: 2200 };
  const order = (el: Element) =>
    [...el.querySelectorAll("[data-gauge-part]")].map((p) => p.getAttribute("data-gauge-part"));

  it("draws the Planned ring under the two ticks and the Eaten dot over them, so a bound never hides the dot", () => {
    const { container } = render(<AverageGauge macro="energy" range={RANGE} eaten={2013} withPlan={2328} />);
    const gauge = container.querySelector('[data-gauge="energy"]')!;
    expect(gauge).toHaveAttribute("data-gauge-average", "");
    expect(gauge).toHaveAttribute("aria-hidden", "true");
    expect(order(gauge)).toEqual(["track", "band", "mark-withPlan", "tick-lower", "tick-upper", "mark-eaten"]);
  });

  it("draws the band and the ticks exactly as a week row's gauge does for the same range", () => {
    const drawn = (el: Element) =>
      ["band", "tick-lower", "tick-upper"].map((part) => {
        const node = el.querySelector(`[data-gauge-part="${part}"]`)!;
        return { part, class: classes(node).sort(), style: node.getAttribute("style") };
      });
    for (const macro of ["energy", "protein"] as const) {
      const { container: average } = render(<AverageGauge macro={macro} range={RANGE} eaten={2013} withPlan={2328} />);
      const { container: day } = render(<Gauge size="mini" macro={macro} range={RANGE} eaten={800} withPlan={1500} />);
      expect(drawn(average)).toEqual(drawn(day));
    }
  });

  it("draws the ring in the plan tint with the macro's border, and the dot in the macro's hue with a surface edge", () => {
    const { container } = render(<AverageGauge macro="protein" range={RANGE} eaten={140} withPlan={150} />);
    const ring = classes(container.querySelector('[data-gauge-part="mark-withPlan"]'));
    const dot = classes(container.querySelector('[data-gauge-part="mark-eaten"]'));
    expect(ring).toEqual(expect.arrayContaining(["bg-protein-plan", "border-protein", "rounded-full"]));
    expect(dot).toEqual(expect.arrayContaining(["bg-protein", "border-surface", "rounded-full"]));
    expect(dot).not.toContain("bg-protein-plan");
  });

  it("draws only the ring when Eaten has no position", () => {
    const { container } = render(<AverageGauge macro="energy" range={RANGE} eaten={null} withPlan={2328} />);
    expect(order(container)).toEqual(["track", "band", "mark-withPlan", "tick-lower", "tick-upper"]);
  });

  it("draws no mark when neither reading has a position", () => {
    const { container } = render(<AverageGauge macro="energy" range={RANGE} eaten={null} withPlan={null} />);
    expect(order(container)).toEqual(["track", "band", "tick-lower", "tick-upper"]);
  });

  it("draws only the dot, over the ticks, when Planned has no position", () => {
    const { container } = render(<AverageGauge macro="energy" range={RANGE} eaten={2013} withPlan={null} />);
    expect(order(container)).toEqual(["track", "band", "tick-lower", "tick-upper", "mark-eaten"]);
  });

  it("is the mini gauge's height, as the day rows' gauges are", () => {
    const { container } = render(<AverageGauge macro="energy" range={RANGE} eaten={2013} withPlan={2328} />);
    const average = container.querySelector("[data-gauge]")!;
    const mini = parts("mini");
    expect(heightClasses(average)).toEqual(heightClasses(mini.frame));
    expect(heightClasses(average.querySelector('[data-gauge-part="track"]'))).toEqual(heightClasses(mini.track));
  });
});
