import { btnText, btnTextDanger, segmentedTray } from "@/components/ui/styles";

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
