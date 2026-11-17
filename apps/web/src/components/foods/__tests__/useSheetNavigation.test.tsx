import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, type ReactElement } from "react";
import { useSheetNavigation } from "../useSheetNavigation";

// The stack of views a tall sheet navigates, with the scroll and the focus
// each level returns to. jsdom lays nothing out, so the scroll is set by hand
// as a finger would leave it, and read back after each move.

type View = { name: string };

function Harness(): ReactElement {
  const content = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const nav = useSheetNavigation<View>({ name: "root" }, { content, back, field });
  return (
    <div data-sheet-body="" data-testid="body">
      <div ref={content}>
        <p data-testid="view">{nav.view.name}</p>
        <p data-testid="depth">{nav.depth}</p>
        {nav.depth === 1 ? (
          <input ref={field} aria-label="Field" />
        ) : (
          <button ref={back} onClick={nav.back}>
            Back
          </button>
        )}
        {["a", "b"].map((row) => (
          <button
            key={`${nav.view.name}-${row}`}
            data-row={row}
            onClick={() => nav.open({ name: `${nav.view.name}/${row}` }, `[data-row="${row}"]`)}
          >
            {`Open ${row}`}
          </button>
        ))}
        <button onClick={nav.reset}>Reset</button>
      </div>
    </div>
  );
}

const body = () => screen.getByTestId("body");
const viewName = () => screen.getByTestId("view").textContent;

describe("useSheetNavigation", () => {
  it("opens views three deep and walks back through each, with its scroll and the row that opened the next", () => {
    render(<Harness />);
    body().scrollTop = 120;
    fireEvent.click(screen.getByRole("button", { name: "Open b" }));
    expect(viewName()).toBe("root/b");
    expect(body().scrollTop).toBe(0);
    expect(screen.getByRole("button", { name: "Back" })).toHaveFocus();

    body().scrollTop = 40;
    fireEvent.click(screen.getByRole("button", { name: "Open a" }));
    expect(viewName()).toBe("root/b/a");
    expect(screen.getByTestId("depth").textContent).toBe("3");

    act(() => screen.getByRole("button", { name: "Back" }).click());
    expect(viewName()).toBe("root/b");
    expect(body().scrollTop).toBe(40);
    expect(screen.getByRole("button", { name: "Open a" })).toHaveFocus();

    act(() => screen.getByRole("button", { name: "Back" }).click());
    expect(viewName()).toBe("root");
    expect(body().scrollTop).toBe(120);
    expect(screen.getByRole("button", { name: "Open b" })).toHaveFocus();
  });

  it("resets to the root at its top with focus in the field", () => {
    render(<Harness />);
    body().scrollTop = 80;
    fireEvent.click(screen.getByRole("button", { name: "Open a" }));
    fireEvent.click(screen.getByRole("button", { name: "Open b" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(viewName()).toBe("root");
    expect(body().scrollTop).toBe(0);
    expect(screen.getByRole("textbox", { name: "Field" })).toHaveFocus();
  });
});
