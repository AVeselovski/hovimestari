import { clockTime, gtinCheckDigit, isNewRead, logAsText, middleBand } from "../scanCheckLib";

describe("scan check helpers", () => {
  it("prints a clock time to the millisecond", () => {
    expect(clockTime(new Date(2026, 10, 19, 9, 4, 5, 67))).toBe("09:04:05.067");
  });

  it("takes the middle half of a frame and caps its width at 960", () => {
    expect(middleBand(1280, 720)).toEqual({ sx: 0, sy: 180, sw: 1280, sh: 360, dw: 960, dh: 270 });
    expect(middleBand(720, 1280)).toEqual({ sx: 0, sy: 320, sw: 720, sh: 640, dw: 720, dh: 640 });
  });

  it("logs a repeated read only after 1.5 seconds", () => {
    const last = { text: "6411300000014", at: 1000 };
    expect(isNewRead(null, "6411300000014", 1000)).toBe(true);
    expect(isNewRead(last, "6411300000014", 2499)).toBe(false);
    expect(isNewRead(last, "6411300000014", 2500)).toBe(true);
    expect(isNewRead(last, "4006381333931", 1100)).toBe(true);
  });

  it("computes GS1 check digits", () => {
    expect(gtinCheckDigit("400638133393")).toBe(1);
    expect(gtinCheckDigit("9638507")).toBe(4);
  });

  it("puts the rate line first and the newest line next", () => {
    const at = new Date(2026, 10, 19, 9, 0, 0, 0);
    const text = logAsText(
      [
        { id: 2, at, text: "second" },
        { id: 1, at, text: "first" },
      ],
      "rate",
    );
    expect(text).toBe("now  rate\n09:00:00.000  second\n09:00:00.000  first");
  });
});
