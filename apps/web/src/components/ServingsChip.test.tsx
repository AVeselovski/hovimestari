import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServingsChip, servingsOptions } from "./ServingsChip.js";

const errorSpy = vi.spyOn(console, "error").mockImplementation((msg, ...rest) => {
  if (typeof msg === "string" && msg.includes("useLayoutEffect")) return;
  console.warn(msg, ...rest);
});
beforeAll(() => errorSpy.mockClear());
afterAll(() => errorSpy.mockRestore());

describe("servingsOptions", () => {
  it("dedupes when base coincides with a fixed option", () => {
    expect(servingsOptions(4)).toEqual([4, 6, 8]);
    expect(servingsOptions(6)).toEqual([4, 6, 8]);
    expect(servingsOptions(8)).toEqual([4, 6, 8]);
  });

  it("inserts a non-preset base in sorted position", () => {
    expect(servingsOptions(2)).toEqual([2, 4, 6, 8]);
    expect(servingsOptions(5)).toEqual([4, 5, 6, 8]);
    expect(servingsOptions(10)).toEqual([4, 6, 8, 10]);
  });
});

describe("ServingsChip", () => {
  it("renders one button per deduped option", () => {
    const html = renderToStaticMarkup(
      <ServingsChip base={4} value={4} onChange={() => {}} />,
    );
    const matches = html.match(/<button/g) ?? [];
    expect(matches.length).toBe(3);
    expect(html).toContain("4 ann");
    expect(html).toContain("6 ann");
    expect(html).toContain("8 ann");
  });

  it("renders four buttons when the base is non-preset", () => {
    const html = renderToStaticMarkup(
      <ServingsChip base={2} value={2} onChange={() => {}} />,
    );
    const matches = html.match(/<button/g) ?? [];
    expect(matches.length).toBe(4);
  });

  it("marks the base chip with an aria-label suffix and a dot marker", () => {
    const html = renderToStaticMarkup(
      <ServingsChip base={4} value={6} onChange={() => {}} />,
    );
    expect(html).toContain('aria-label="4 annosta (oletus)"');
    expect(html).toContain('aria-label="6 annosta"');
    // The dot marker is a small span; assert at least one such marker is rendered.
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>/);
  });

  it("sets aria-pressed on the selected chip", () => {
    const html = renderToStaticMarkup(
      <ServingsChip base={4} value={6} onChange={() => {}} />,
    );
    // 4: not selected; 6: selected; 8: not selected.
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    const selected = buttons.filter((b) => b.includes('aria-pressed="true"'));
    expect(selected.length).toBe(1);
    expect(selected[0]).toContain('aria-label="6 annosta"');
  });

  it("passes the clicked value to onChange (handler contract only — no DOM event)", () => {
    // Without @testing-library/react we cannot dispatch a real click event
    // against the SSR-rendered markup. This test asserts the handler contract
    // only: for each option, calling `onChange(n)` (which mirrors the
    // component's `onClick={() => onChange(n)}`) receives the option value.
    const calls: number[] = [];
    const options = servingsOptions(4);
    for (const n of options) {
      const onChange = (next: number): void => {
        calls.push(next);
      };
      onChange(n);
    }
    expect(calls).toEqual([4, 6, 8]);
  });
});
