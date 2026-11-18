import {
  btnText,
  btnTextDanger,
  dayEntriesHead,
  dayEntriesHeadButton,
  dayEntriesHeading,
  dayHeadLine,
  formStack,
  lineRoom,
  pairRow,
  sectionStart,
  sectionStartWhenFilled,
  segmentedTray,
} from "@/components/ui/styles";
import fs from "node:fs";
import path from "node:path";

const tokens = (recipe: string) => recipe.split(/\s+/);

describe("text buttons", () => {
  it.each([
    ["btnText", btnText],
    ["btnTextDanger", btnTextDanger],
  ])("%s answers a hover and a press by filling in its underline", (_name, recipe) => {
    const list = tokens(recipe);
    const rest = list.find((t) => t.startsWith("decoration-"));
    const hover = list.find((t) => t.startsWith("hover:decoration-"));
    const active = list.find((t) => t.startsWith("active:decoration-"));
    expect(rest).toBeDefined();
    expect(hover).toBeDefined();
    expect(active).toBe(`active:${hover?.slice("hover:".length)}`);
    // The underline at rest is lighter than under the finger.
    expect(hover?.slice("hover:".length)).not.toBe(rest);
  });

  // The underline is what marks the words as a button, so at rest it is a mark that reaches
  // 3 to 1 (themeColors.test.ts): the control edge, or the accent at 70 %.
  it("rest on underlines that can be seen", () => {
    expect(tokens(btnText)).toContain("decoration-field-rule");
    expect(tokens(btnTextDanger)).toContain("decoration-accent/70");
  });
});

describe("segmented tray", () => {
  it("has the control edge, not a decoration rule", () => {
    expect(tokens(segmentedTray)).toContain("border-field-rule");
    expect(tokens(segmentedTray)).not.toContain("border-rule");
  });
});

describe("a form's density", () => {
  it("keeps one line of room under a field", () => {
    // One line of room, and the hook that lets a last line be the room above a sheet's footer.
    expect(lineRoom).toBe("min-h-5 field-line");
  });

  // The reserved line already sets a field apart: 8 px to the next field, 16 before a section.
  it("puts 8 px between fields and 16 before a section, on a phone and from md", () => {
    expect(tokens(formStack)).toEqual(["flex", "flex-col", "gap-2"]);
    expect(tokens(sectionStart)).toEqual(["mt-2"]);
    // A line that starts a section only while filled: 16 px when filled, and the stack's 8 px gap taken back when empty.
    expect(tokens(sectionStartWhenFilled)).toEqual(["mt-2", "empty:-mt-2"]);
    expect(tokens(pairRow)).toEqual(expect.arrayContaining(["flex-col", "gap-2", "md:gap-y-2"]));
    expect(tokens(pairRow)).not.toContain("space-y-3");
  });
});

describe("the Day tab's head lines", () => {
  const belowLg = (recipe: string) => tokens(recipe).filter((t) => !t.startsWith("lg:"));

  it("keeps the phone's Entries row as it was: everything the lg line adds is lg only", () => {
    expect(belowLg(dayEntriesHead)).toEqual(tokens("flex min-h-11 items-center justify-between gap-3"));
    // The heading's base is the section label, the button's is btnText, set beside it.
    expect(
      tokens(dayEntriesHeading)
        .filter((t) => t !== "section-label")
        .every((t) => t.startsWith("lg:")),
    ).toBe(true);
    expect(tokens(dayEntriesHeadButton).every((t) => t.startsWith("lg:"))).toBe(true);
  });

  it("puts the Entries heading on the same line as the summary's heads from lg", () => {
    // Tailwind reads whole class strings, so the line is written in both recipes.
    // From md the summary's head line is this height, and from lg the Entries heading's.
    const md = tokens(dayHeadLine)
      .filter((t) => t.startsWith("md:"))
      .map((t) => t.slice(3));
    const lg = tokens(dayEntriesHeading)
      .filter((t) => t.startsWith("lg:"))
      .map((t) => t.slice(3));
    const lineOf = (list: string[]) => list.filter((t) => t.startsWith("min-h-"));
    expect(lineOf(lg)).toEqual(lineOf(md));
    expect(lineOf(lg)).toHaveLength(1);
    expect(lg).toEqual(expect.arrayContaining(["flex", "items-center"]));
    expect(tokens(dayHeadLine)).toEqual(expect.arrayContaining(["flex", "items-center"]));
  });

  it("is the line the summary's macro heads sit on", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../day/DaySummary.tsx"), "utf8");
    expect(source).toContain("className={`${dayHeadLine} justify-between gap-3`}");
  });
});
