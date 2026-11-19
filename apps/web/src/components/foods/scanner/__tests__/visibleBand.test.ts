import { visibleBand, type Box } from "../useCameraStream";

// The part of a camera frame the scanner decodes: what shows under the band
// on screen, through the video's `object-fit: cover` crop. The picture is a
// 4:3 box, 350 by 262.5 on a 390 pixel phone, and the band is inset 20
// pixels at the sides and a quarter of the height at the top and the bottom.

const VIEW: Box = { left: 0, top: 0, width: 350, height: 262.5 };
const BAND: Box = { left: 20, top: 65.625, width: 310, height: 131.25 };

describe("visibleBand", () => {
  it("cuts a landscape frame's sides, as the picture does, and keeps the band's rows", () => {
    // 1280 by 720 covers the box at 0.365: 467 pixels wide, so 58 pixels of it are off screen at each side.
    expect(visibleBand(1280, 720, VIEW, BAND)).toEqual({ sx: 215, sy: 180, sw: 850, sh: 360, dw: 850, dh: 360 });
  });

  it("cuts a portrait frame's top and bottom, so a code above or below the band is never read", () => {
    // 720 by 1280, as a phone held upright gives: the picture shows rows 370 to 910, the band rows 505 to 775.
    expect(visibleBand(720, 1280, VIEW, BAND)).toEqual({ sx: 41, sy: 505, sw: 638, sh: 270, dw: 638, dh: 270 });
  });

  it("cuts nothing off a 4:3 frame, and draws a wide band at most 960 pixels wide", () => {
    expect(visibleBand(1280, 960, VIEW, BAND)).toEqual({ sx: 73, sy: 240, sw: 1134, sh: 480, dw: 960, dh: 406 });
  });

  it("measures the band from the picture's own box, wherever the picture sits on the page", () => {
    const view = { ...VIEW, left: 20, top: 100 };
    const band = { ...BAND, left: 40, top: 165.625 };
    expect(visibleBand(1280, 720, view, band)).toEqual(visibleBand(1280, 720, VIEW, BAND));
  });

  it("keeps to the picture when the band reaches past it", () => {
    const band = { left: -50, top: -50, width: 450, height: 400 };
    expect(visibleBand(1280, 960, VIEW, band)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 960, dw: 960, dh: 720 });
    // A landscape frame's sides are off screen, so they stay out however wide the band is.
    expect(visibleBand(1280, 720, VIEW, band)).toEqual({ sx: 160, sy: 0, sw: 960, sh: 720, dw: 960, dh: 720 });
  });

  it("has nothing to decode with no frame yet, no box laid out, or a band off the picture", () => {
    expect(visibleBand(0, 0, VIEW, BAND)).toBeNull();
    expect(visibleBand(1280, 720, { ...VIEW, width: 0, height: 0 }, BAND)).toBeNull();
    expect(visibleBand(1280, 720, VIEW, { ...BAND, left: 400 })).toBeNull();
  });
});
