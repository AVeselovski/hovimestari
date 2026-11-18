import { FormSheet, type FormFailure } from "@/components/ui/FormSheet";
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

/** A sheet with two fields whose save is refused in the footer, by no field. */
function FooterRefusalSheet(): ReactElement {
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [, setRenders] = useState(0);
  return (
    <FormSheet
      open
      onClose={jest.fn()}
      title="Two fields"
      returnFocusTo={null}
      dirty={false}
      submitting={false}
      formError={formError}
      idle="Save"
      busy="Saving…"
      onSubmit={() => setFormError({ line: "That did not save.", cause: null })}
    >
      {() => (
        <>
          {(["a", "b"] as const).map((k) => (
            <div key={k}>
              <label htmlFor={k}>{k}</label>
              <input id={k} defaultValue="x" aria-describedby={`${k}-line`} />
              <p id={`${k}-line`}>Copy the figures from the label.</p>
            </div>
          ))}
          {/* Renders the sheet again with the same refusal, as typing would. */}
          <button type="button" onClick={() => setRenders((n) => n + 1)}>
            again
          </button>
        </>
      )}
    </FormSheet>
  );
}

/**
 * Lays out each field's parts as a browser would, stacked inside the
 * scrolled content from `top`: its label (20 px), the field (40 px) and its
 * line (20 px). A box moves up by the body's scrollTop.
 */
function layoutParts(tops: Record<string, number>): void {
  for (const [id, top] of Object.entries(tops)) {
    const parts: Array<[HTMLElement, number, number]> = [
      [document.querySelector<HTMLElement>(`label[for="${id}"]`)!, 0, 20],
      [document.getElementById(id)!, 20, 60],
      [document.getElementById(`${id}-line`)!, 60, 80],
    ];
    for (const [el, from, to] of parts) {
      el.getBoundingClientRect = () => {
        const y = BODY.top + top - body().scrollTop;
        return { top: y + from, bottom: y + to, height: to - from, left: 0, right: 300, width: 300 } as DOMRect;
      };
    }
  }
}

/**
 * The body as a phone gives it under a held sheet height: the footer's
 * refusal line, with its 8 px gap, takes its 48 px from the body's bottom.
 */
function holdSheet(): void {
  const footerLine = () => document.querySelector("[data-sheet-footer] [data-form-error]")!;
  body().getBoundingClientRect = () => {
    const bottom = BODY.bottom - (footerLine().textContent ? 48 : 0);
    return { top: BODY.top, bottom, height: bottom - BODY.top, left: 0, right: 300, width: 300 } as DOMRect;
  };
}

async function refuseWithFocusOn(id: string, top: number): Promise<void> {
  render(<FooterRefusalSheet />);
  layoutParts({ a: 0, [id]: top });
  holdSheet();
  act(() => document.getElementById(id)!.focus());
  await submit();
  expect(screen.getByText("That did not save.")).toBeInTheDocument();
}

// The body's bottom edge is at 400 before the refusal and at 352 after it.
describe("A form sheet refused in its footer", () => {
  it("brings the focused field and its label back into view when the taller footer covers the field", async () => {
    // b's field runs from 320 to 360 on screen: 8 px under the new edge.
    await refuseWithFocusOn("b", 200);
    // Only as far as the field: its line, a hint here, stays covered.
    expect(body().scrollTop).toBe(8);
  });

  // The refusal is in the footer. The line under the field is a hint at that
  // moment, so a field in view with its label holds still.
  it("moves nothing when only the focused field's line is covered", async () => {
    // b's field runs from 300 to 340, its line from 340 to 360: under the edge at 352.
    await refuseWithFocusOn("b", 180);
    expect(body().scrollTop).toBe(0);
  });

  it("moves nothing when the focused field stays in view", async () => {
    await refuseWithFocusOn("b", 120);
    expect(body().scrollTop).toBe(0);
  });

  it("moves nothing when no field holds focus", async () => {
    render(<FooterRefusalSheet />);
    layoutParts({ a: 0, b: 200 });
    holdSheet();
    act(() => body().focus());
    await submit();
    expect(body().scrollTop).toBe(0);
  });

  // Once, as the refusal shows: a scroll the reader makes afterwards stays,
  // whatever renders the sheet again while the same refusal shows.
  it("leaves a later scroll alone while the same refusal shows", async () => {
    await refuseWithFocusOn("b", 200);
    act(() => {
      // b's field now runs from 20 to 60 on screen, above the body's top edge at 100.
      body().scrollTop = 300;
    });
    fireEvent.click(screen.getByRole("button", { name: "again" }));
    expect(body().scrollTop).toBe(300);
  });
});
