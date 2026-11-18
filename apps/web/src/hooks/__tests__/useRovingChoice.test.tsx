import { useRovingChoice } from "@/hooks/useRovingChoice";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

type Size = "s" | "m" | "l";
const SIZES: readonly Size[] = ["s", "m", "l"];

function Group({ initial = "s", locked = [] }: { initial?: Size | null; locked?: Size[] }) {
  const [value, setValue] = useState<Size | null>(initial);
  const roving = useRovingChoice(SIZES, value, setValue, (o) => locked.includes(o));
  return (
    <div role="radiogroup" aria-label="Size">
      {SIZES.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          disabled={locked.includes(s)}
          onClick={() => setValue(s)}
          {...roving.optionProps(s)}
        >
          {s.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

const radio = (name: string) => screen.getByRole("radio", { name });

describe("useRovingChoice", () => {
  it("puts only the chosen option in the Tab order", () => {
    render(<Group initial="m" />);
    expect(radio("S")).toHaveAttribute("tabindex", "-1");
    expect(radio("M")).toHaveAttribute("tabindex", "0");
    expect(radio("L")).toHaveAttribute("tabindex", "-1");
  });

  it("gives the Tab stop to the first option when nothing is chosen", () => {
    render(<Group initial={null} />);
    expect(radio("S")).toHaveAttribute("tabindex", "0");
  });

  it("moves the choice and focus with the arrow keys, wrapping at either end", () => {
    render(<Group />);
    radio("S").focus();
    fireEvent.keyDown(radio("S"), { key: "ArrowRight" });
    expect(radio("M")).toHaveFocus();
    expect(radio("M")).toHaveAttribute("aria-checked", "true");
    expect(radio("M")).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(radio("M"), { key: "ArrowDown" });
    expect(radio("L")).toHaveFocus();
    fireEvent.keyDown(radio("L"), { key: "ArrowRight" });
    expect(radio("S")).toHaveFocus();
    fireEvent.keyDown(radio("S"), { key: "ArrowLeft" });
    expect(radio("L")).toHaveFocus();
    fireEvent.keyDown(radio("L"), { key: "ArrowUp" });
    expect(radio("M")).toHaveAttribute("aria-checked", "true");
  });

  it("goes to the ends with Home and End", () => {
    render(<Group initial="m" />);
    fireEvent.keyDown(radio("M"), { key: "End" });
    expect(radio("L")).toHaveFocus();
    fireEvent.keyDown(radio("L"), { key: "Home" });
    expect(radio("S")).toHaveFocus();
    expect(radio("S")).toHaveAttribute("aria-checked", "true");
  });

  it("skips a locked option", () => {
    render(<Group locked={["m"]} />);
    fireEvent.keyDown(radio("S"), { key: "ArrowRight" });
    expect(radio("L")).toHaveFocus();
    expect(radio("M")).toHaveAttribute("aria-checked", "false");
  });

  it("leaves every other key alone, so Tab still leaves the group", () => {
    render(<Group />);
    const tab = fireEvent.keyDown(radio("S"), { key: "Tab" });
    // fireEvent returns false when a handler called preventDefault.
    expect(tab).toBe(true);
    expect(radio("S")).toHaveAttribute("aria-checked", "true");
  });

  it("brings the option a key moves to fully into view, to the nearest edge, and leaves a click alone", () => {
    // jsdom lays nothing out and has no scrollIntoView: record the calls.
    const calls: { el: Element; arg: unknown }[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      calls.push({ el: this, arg });
    };
    try {
      render(<Group />);
      radio("S").focus();
      fireEvent.keyDown(radio("S"), { key: "ArrowRight" });
      expect(calls).toEqual([{ el: radio("M"), arg: { block: "nearest", inline: "nearest" } }]);
      fireEvent.keyDown(radio("M"), { key: "End" });
      expect(calls.at(-1)?.el).toBe(radio("L"));
      calls.length = 0;
      fireEvent.click(radio("S"));
      expect(calls).toEqual([]);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});
