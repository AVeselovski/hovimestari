import { describe, it, expect } from "vitest";
import { scaleToFit, MAX_DIMENSION } from "./imagePreprocess.js";

describe("scaleToFit", () => {
  it("does not upscale when the image is smaller than the cap", () => {
    expect(scaleToFit(800, 600, MAX_DIMENSION)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("scales landscape photos to fit the cap on the long edge", () => {
    const r = scaleToFit(4000, 3000, MAX_DIMENSION);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(MAX_DIMENSION);
    expect(r.width).toBe(2000);
    expect(r.height).toBe(1500);
  });

  it("scales portrait photos to fit the cap on the long edge", () => {
    const r = scaleToFit(3000, 4000, MAX_DIMENSION);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(MAX_DIMENSION);
    expect(r.height).toBe(2000);
    expect(r.width).toBe(1500);
  });

  it("preserves aspect ratio (within rounding)", () => {
    const r = scaleToFit(4032, 3024, MAX_DIMENSION);
    const inputRatio = 4032 / 3024;
    const outputRatio = r.width / r.height;
    expect(Math.abs(inputRatio - outputRatio)).toBeLessThan(0.01);
  });

  it("handles square images", () => {
    const r = scaleToFit(2500, 2500, MAX_DIMENSION);
    expect(r.width).toBe(2000);
    expect(r.height).toBe(2000);
  });
});
