import { FormSheet } from "@/components/ui/FormSheet";
import { fieldBlockOf } from "@/lib/revealRefused";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";

// A refused submit brings the first refused field, its line included, into
// view inside the sheet's scrolling body (lib/revealRefused.ts). jsdom has no
// layout, so the boxes are given as a browser would report them: the body is
// a fixed window, and a block's box moves up by the body's scrollTop. The
// real geometry at 320 by 568 is measured in a browser.

const BODY = { top: 100, bottom: 400 };

/** Lays out the body and the blocks: `tops` are each block's top inside the scrolled content, 80 px tall. */
function layout(tops: Record<string, number>): void {
  const body = document.querySelector<HTMLElement>("[data-sheet-body]")!;
  body.getBoundingClientRect = () => ({ ...BODY, height: 300, left: 0, right: 300, width: 300 }) as DOMRect;
  for (const [id, top] of Object.entries(tops)) {
    const block = fieldBlockOf(document.getElementById(id)!);
    block.getBoundingClientRect = () => {
      const y = BODY.top + top - body.scrollTop;
      return { top: y, bottom: y + 80, height: 80, left: 0, right: 300, width: 300 } as DOMRect;
    };
  }
}

/** A sheet with two fields, each with its line, that refuses what is empty: at once, or once its promise answers. */
function Sheet({ late = false }: { late?: boolean }): ReactElement {
  const [values, setValues] = useState({ a: "x", b: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refuse = () =>
    setErrors(
      Object.fromEntries(
        Object.entries(values)
          .filter(([, v]) => v === "")
          .map(([k]) => [k, "Enter a value."]),
      ),
    );
  return (
    <FormSheet
      open
      onClose={jest.fn()}
      title="Two fields"
      returnFocusTo={null}
      dirty={false}
      submitting={false}
      formError={null}
      idle="Save"
      busy="Saving…"
      onSubmit={async () => {
        if (!late) return refuse();
        await Promise.resolve();
        refuse();
      }}
    >
      {() =>
        (["a", "b"] as const).map((k) => (
          <div key={k}>
            <label htmlFor={k}>{k}</label>
            <input
              id={k}
              value={values[k]}
              onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
              aria-invalid={errors[k] ? true : undefined}
              aria-describedby={`${k}-line`}
            />
            <p id={`${k}-line`}>{errors[k]}</p>
          </div>
        ))
      }
    </FormSheet>
  );
}

const body = () => document.querySelector<HTMLElement>("[data-sheet-body]")!;
const submit = async () => {
  await act(async () => {
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
  });
};

describe("A refused form sheet", () => {
  it("takes the field's block, its line included, as what comes into view", () => {
    render(<Sheet />);
    const block = fieldBlockOf(document.getElementById("b")!);
    expect(block).toContainElement(document.getElementById("b-line"));
    expect(block).not.toContainElement(document.getElementById("a"));
  });

  it("scrolls the body so the refused field's line clears its bottom edge", async () => {
    render(<Sheet />);
    // b's block runs from 360 to 440 in the content: 40 px under the body's edge.
    layout({ a: 0, b: 360 });
    await submit();
    expect(body().scrollTop).toBe(140);
  });

  it("does the same for a refusal that arrives with the answer", async () => {
    render(<Sheet late />);
    layout({ a: 0, b: 360 });
    await submit();
    expect(body().scrollTop).toBe(140);
  });

  it("scrolls up to a refused field above the body's top edge", async () => {
    render(<Sheet />);
    layout({ a: 0, b: 360 });
    body().scrollTop = 500;
    await submit();
    // b's block is at 360 - 500 = -140 from the top: it comes to the top.
    expect(body().scrollTop).toBe(360);
  });

  it("moves nothing when the refused field is already in view", async () => {
    render(<Sheet />);
    layout({ a: 0, b: 120 });
    await submit();
    expect(body().scrollTop).toBe(0);
  });
});
