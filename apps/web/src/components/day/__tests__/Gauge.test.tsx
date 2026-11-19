import { render } from "@testing-library/react";
import { Gauge, GaugeFrame, type GaugeSize } from "../Gauge";

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
