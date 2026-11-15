import fs from "node:fs";
import path from "node:path";

// The safe-area insets are read in one place, globals.css, as the
// --safe-top/right/bottom/left tokens. Every other file reads those tokens,
// so a change to how insets are handled happens once.

const SRC = path.resolve(__dirname, "../..");
const ALLOWED = path.join(SRC, "app", "globals.css");

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : files(full);
    return [full];
  });
}

describe("safe areas", () => {
  it("are read from env() in globals.css only", () => {
    const offenders = files(SRC)
      .filter((file) => file !== ALLOWED && /\.(tsx?|css)$/.test(file))
      .filter((file) => fs.readFileSync(file, "utf8").includes("safe-area-inset"))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });

  it("are defined there, all four", () => {
    const css = fs.readFileSync(ALLOWED, "utf8");
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(css).toContain(`--safe-${side}: env(safe-area-inset-${side}, 0px)`);
    }
  });
});
