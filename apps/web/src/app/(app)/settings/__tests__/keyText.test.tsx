import { render } from "@testing-library/react";
import { KEY_TAIL_MIN, KeyText } from "../_components/KeyRevealSheet";

// The key in its box breaks between any two characters, never just after a
// hyphen, and its last line holds a few characters, never one. The layout is
// the browser's, so this checks the structure that keeps it so: every run of
// hyphens shares a no-wrap run with the character after it, the last few
// characters share one no-wrap run, and the text is exactly the key.
describe("KeyText", () => {
  const sample = ["ab", "cd--ef", "g", "", "h"].join("-");

  it("renders the key exactly, so a selection copies it whole", () => {
    const { container } = render(<KeyText text={sample} />);
    expect(container.textContent).toBe(sample);
  });

  it("keeps each run of hyphens on one line with the character after it", () => {
    const { container } = render(<KeyText text={sample} />);
    const runs = [...container.querySelectorAll("span")].map((s) => [s.textContent, s.className]);
    expect(runs).toEqual([
      ["-c", "whitespace-nowrap"],
      ["--e", "whitespace-nowrap"],
      // The last run of hyphens is part of the tail, which takes whole units until it holds four characters.
      ["-g--h", "whitespace-nowrap"],
    ]);
    // No hyphen is left in a bare text node, where a line could end on it.
    const bare = [...container.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent);
    expect(bare.join("")).not.toContain("-");
  });

  it("keeps the last characters of a key with no hyphen on one line, and the rest as plain text", () => {
    const { container } = render(<KeyText text="abcdefgh" />);
    const spans = [...container.querySelectorAll("span")];
    expect(spans.map((s) => s.textContent)).toEqual(["efgh"]);
    expect(spans[0].textContent).toHaveLength(KEY_TAIL_MIN);
    expect(container.firstChild?.textContent).toBe("abcd");
    expect(container.textContent).toBe("abcdefgh");
  });

  it("keeps a key shorter than the tail whole", () => {
    const { container } = render(<KeyText text="ab" />);
    expect([...container.querySelectorAll("span")].map((s) => s.textContent)).toEqual(["ab"]);
  });
});
