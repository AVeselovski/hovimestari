import fs from "node:fs";
import path from "node:path";

// iOS WebKit sizes a native date input from its own intrinsic width and
// ignores the specified one, so one overflows a phone's sheet unless both of
// the globals.css rules below reach it. A new date-like input type has to be
// added to both selector lists; this pins the ones in use.
const css = fs.readFileSync(path.resolve(__dirname, "../globals.css"), "utf-8");
const SRC = path.resolve(__dirname, "..", "..");

/** The input types in the selector list a rule's pattern captures as group 1. */
function selectorsOf(rule: RegExp): string[] {
  const match = rule.exec(css);
  if (!match) throw new Error(`Rule not found: ${rule}`);
  return [...match[1].matchAll(/input\[type="([a-z-]+)"\]/g)].map((m) => m[1]);
}

function typesUsedInSource(dir: string, found = new Set<string>()): Set<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__" && entry.name !== "node_modules") typesUsedInSource(full, found);
    } else if (/\.tsx$/.test(entry.name)) {
      for (const m of fs.readFileSync(full, "utf-8").matchAll(/type="(date|month|week|time|datetime-local)"/g)) {
        found.add(m[1]);
      }
    }
  }
  return found;
}

describe("globals.css native date-like inputs (iOS intrinsic width)", () => {
  const list = String.raw`((?:input\[type="[a-z-]+"\],?\s*)+)`;
  const sizing = selectorsOf(new RegExp(`${list}\\{\\s*min-width: 0;`));
  const reset = selectorsOf(
    new RegExp(String.raw`@media \(pointer: coarse\) \{\s*` + list + String.raw`\{\s*-webkit-appearance: none;`),
  );

  it("covers date in both the sizing rule and the coarse-pointer reset", () => {
    expect(sizing).toContain("date");
    expect(reset).toContain("date");
  });

  it("covers every date-like input type the app renders", () => {
    const used = [...typesUsedInSource(SRC)];
    expect(used).toContain("date");
    for (const type of used) {
      expect(sizing).toContain(type);
      expect(reset).toContain(type);
    }
  });
});
