import { gaugeGeometry, planStyle, scaleOf } from "../gaugeGeometry";

const CALORIES = { lower: 1900, upper: 2200 };
const PROTEIN = { lower: 140, upper: 142 };

describe("gaugeGeometry", () => {
  it("runs the scale to 1.25 × the upper bound and draws the band from the lower bound to 80 %", () => {
    const g = gaugeGeometry(CALORIES, 1240, 1980);
    expect(g.scale).toBe(2750);
    expect(g.band.start).toBeCloseTo(69.09, 2);
    expect(g.band.end).toBeCloseTo(80, 10);
    expect(g.ticks).toEqual({ lower: g.band.start, upper: g.band.end });
    expect(g.eaten?.end).toBeCloseTo(45.09, 2);
    expect(g.plan).toEqual({ start: g.eaten!.end, end: expect.closeTo(72, 5), roundedStart: false });
    expect(g.cap).toBeNull();
  });

  it("draws a narrow protein range 2 % wide from its floor, which stays exact: 140 to 142 g", () => {
    const g = gaugeGeometry(PROTEIN, 0, 0);
    expect(g.scale).toBe(177.5);
    expect(g.band.start).toBeCloseTo(78.87, 2);
    expect(g.band.end).toBeCloseTo(80.87, 2);
    expect(g.ticks.lower).toBeCloseTo(78.87, 2);
    expect(g.ticks.upper).toBeCloseTo(80.87, 2);
    // Below the floor ends left of the floor tick, within ends inside the band.
    expect(gaugeGeometry(PROTEIN, 139.9, 139.9).eaten!.end).toBeLessThan(g.ticks.lower);
    const within = gaugeGeometry(PROTEIN, 141, 141).eaten!.end;
    expect(within).toBeCloseTo(79.44, 2);
    expect(within).toBeGreaterThan(g.ticks.lower);
    expect(within).toBeLessThan(g.ticks.upper);
  });

  it("draws equal bounds as a 2 % band from the bound, with two ticks", () => {
    const g = gaugeGeometry({ lower: 150, upper: 150 }, 100, 100);
    expect(g.band.start).toBeCloseTo(80, 10);
    expect(g.band.end).toBeCloseTo(82, 10);
    expect(g.ticks.upper - g.ticks.lower).toBeCloseTo(2, 10);
  });

  it("clamps eaten past the scale at 100 with a solid end-cap", () => {
    const g = gaugeGeometry(CALORIES, 3000, 3200);
    expect(g.eaten!.end).toBe(100);
    expect(g.plan).toBeNull();
    expect(g.cap).toBe("eaten");
  });

  it("sets a plan-style end-cap when only eaten plus planned passes the scale", () => {
    const g = gaugeGeometry(CALORIES, 2000, 2800);
    expect(g.eaten!.end).toBeCloseTo(72.73, 2);
    expect(g.plan).toEqual({ start: g.eaten!.end, end: 100, roundedStart: false });
    expect(g.cap).toBe("plan");
  });

  it("draws a plan segment of 1 g at least 4 px wide, laid against the end rather than crossing it", () => {
    const g = gaugeGeometry({ lower: 140, upper: 180 }, 100, 101);
    expect(g.plan!.end - g.plan!.start).toBeCloseTo(0.44, 2);
    const style = planStyle(g.plan!);
    expect(style.width).toBe(`max(4px, ${g.plan!.end - g.plan!.start}%)`);
    expect(style.left).toBe(`min(${g.plan!.start}%, calc(100% - ${style.width}))`);
  });

  it("starts the plan segment at 0 with the rounded start when nothing is eaten", () => {
    const g = gaugeGeometry(PROTEIN, 0, 60);
    expect(g.eaten).toBeNull();
    expect(g.plan).toEqual({ start: 0, end: expect.closeTo(33.8, 1), roundedStart: true });
  });

  it("draws no plan segment when eaten equals eaten plus planned, and nothing at all at zero", () => {
    expect(gaugeGeometry(CALORIES, 1500, 1500).plan).toBeNull();
    const empty = gaugeGeometry(CALORIES, 0, 0);
    expect(empty.eaten).toBeNull();
    expect(empty.plan).toBeNull();
    expect(empty.cap).toBeNull();
  });

  it("never lets the scale fall under 1", () => {
    expect(scaleOf({ lower: 0.1, upper: 0.2 })).toBe(1);
  });
});
