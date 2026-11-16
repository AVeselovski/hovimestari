import fs from "node:fs";
import path from "node:path";
import { THEME_COLORS } from "../../lib/theme/noFlashScript";
import manifest from "../manifest";

// The page background and ink are written in four places that cannot import
// the stylesheet: the browser chrome colours, the manifest, and the service
// worker's offline page. This holds them to the tokens in globals.css.

const css = fs.readFileSync(path.resolve(__dirname, "../globals.css"), "utf8");
const sw = fs.readFileSync(path.resolve(__dirname, "../../../public/sw.js"), "utf8");

function token(block: "light" | "dark", name: string): string {
  const source =
    block === "light" ? css.slice(css.indexOf("@theme {")) : css.slice(css.indexOf('[data-theme="dark"] {'));
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6});`, "i").exec(source);
  if (!match) throw new Error(`no --color-${name} in the ${block} tokens`);
  return match[1].toLowerCase();
}

describe("colours written outside the stylesheet", () => {
  it("the browser chrome colours are each theme's page background", () => {
    expect(THEME_COLORS.light).toBe(token("light", "bg"));
    expect(THEME_COLORS.dark).toBe(token("dark", "bg"));
  });

  it("the manifest uses the light page background for its splash and its theme colour", () => {
    const m = manifest();
    expect(m.background_color).toBe(token("light", "bg"));
    expect(m.theme_color).toBe(token("light", "bg"));
  });

  it("the offline page uses each theme's background and ink", () => {
    const [light, dark] = [
      sw.indexOf("background:" + token("light", "bg")),
      sw.indexOf("background:" + token("dark", "bg")),
    ];
    expect(light).toBeGreaterThan(-1);
    expect(dark).toBeGreaterThan(-1);
    expect(sw).toContain(`color:${token("light", "ink")}`);
    expect(sw).toContain(`color:${token("dark", "ink")}`);
  });
});

/** WCAG relative luminance contrast of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` at `alpha` over `bg`, as the browser paints a colour with an opacity modifier. */
function over(fg: string, bg: string, alpha: number): string {
  const channel = (hex: string, i: number): number => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(channel(fg, i) * alpha + channel(bg, i) * (1 - alpha)))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

describe("token contrast", () => {
  // A text button is found by its underline: field-rule for btnText, the accent at 70 % for btnTextDanger (styles.ts).
  it.each(["light", "dark"] as const)(
    "a text button's underline reaches 3 to 1 where text buttons sit, %s",
    (theme) => {
      for (const surface of ["bg", "surface", "surface-raised"]) {
        const ground = token(theme, surface);
        expect(contrast(token(theme, "field-rule"), ground)).toBeGreaterThanOrEqual(3);
        expect(contrast(over(token(theme, "accent"), ground, 0.7), ground)).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it.each(["light", "dark"] as const)("a field's edge reaches 3 to 1 against the page and a panel, %s", (theme) => {
    expect(contrast(token(theme, "field-rule"), token(theme, "bg"))).toBeGreaterThanOrEqual(3);
    expect(contrast(token(theme, "field-rule"), token(theme, "surface"))).toBeGreaterThanOrEqual(3);
  });

  it.each(["light", "dark"] as const)("accent text reaches 4.5 to 1 on the page and the tab bar, %s", (theme) => {
    expect(contrast(token(theme, "accent"), token(theme, "bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(theme, "accent"), token(theme, "surface"))).toBeGreaterThanOrEqual(4.5);
  });

  // An outlined destructive button: accent text on the raised surface a secondary button is filled with.
  it.each(["light", "dark"] as const)("accent text reaches 4.5 to 1 on a raised surface, %s", (theme) => {
    expect(contrast(token(theme, "accent"), token(theme, "surface-raised"))).toBeGreaterThanOrEqual(4.5);
  });

  // A primary or destructive button: its label on the accent fill.
  it.each(["light", "dark"] as const)("text on an accent fill reaches 4.5 to 1, %s", (theme) => {
    expect(contrast(token(theme, "on-accent"), token(theme, "accent"))).toBeGreaterThanOrEqual(4.5);
  });

  // The per-100 g dots sit on a sheet's surface, a stacked sheet's raised one, or the page.
  it.each(["light", "dark"] as const)("each macro hue reaches 3 to 1 as a mark on every surface, %s", (theme) => {
    for (const hue of ["energy", "protein", "carbs", "fat"]) {
      for (const surface of ["bg", "surface", "surface-raised"]) {
        expect([hue, surface, contrast(token(theme, hue), token(theme, surface)) >= 3]).toEqual([hue, surface, true]);
      }
    }
  });

  it.each(["light", "dark"] as const)("muted text reaches 4.5 to 1 on the page and a panel, %s", (theme) => {
    expect(contrast(token(theme, "ink-muted"), token(theme, "bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token(theme, "ink-muted"), token(theme, "surface"))).toBeGreaterThanOrEqual(4.5);
  });

  // The day gauge (components/day/Gauge.tsx, docs/app/colors.md "The gauge").
  it.each(["light", "dark"] as const)("the gauge's band, plan border and ticks hold their lines, %s", (theme) => {
    const track = token(theme, "gauge-track");
    expect(contrast(token(theme, "gauge-range"), track)).toBeGreaterThanOrEqual(1.5);
    for (const [hue, tint] of [
      ["energy", "energy-plan"],
      ["protein", "protein-plan"],
    ]) {
      expect([hue, contrast(token(theme, hue), track) >= 3]).toEqual([hue, true]);
      // A tick is ink with an edge of the page colour: one of the two stands out on every surface it crosses.
      for (const under of [hue, tint, "gauge-range"]) {
        const best = Math.max(
          contrast(token(theme, "ink"), token(theme, under)),
          contrast(token(theme, "bg"), token(theme, under)),
        );
        expect([under, best >= 3]).toEqual([under, true]);
      }
    }
  });

  // Where the eaten fill meets the plan segment, the boundary must read, and the tint must still show on the track.
  it.each(["light", "dark"] as const)("each eaten fill reaches 3 to 1 against its plan tint, %s", (theme) => {
    for (const [hue, tint] of [
      ["energy", "energy-plan"],
      ["protein", "protein-plan"],
    ]) {
      expect([hue, contrast(token(theme, hue), token(theme, tint)) >= 3]).toEqual([hue, true]);
      expect([tint, contrast(token(theme, tint), token(theme, "gauge-track")) >= 1.15]).toEqual([tint, true]);
    }
  });

  it("pins the light energy plan tint", () => {
    expect(token("light", "energy-plan")).toBe("#e6d3b4");
  });
});
