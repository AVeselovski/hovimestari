import { fireEvent, render, screen } from "@testing-library/react";
import { Checkbox } from "../Checkbox";

// ---------------------------------------------------------------------------
// The box is drawn (appearance-none and a sibling tick), so what needs
// pinning is that it is still a real checkbox: named, toggled by its label,
// reporting its state, and drawn in the accent when ticked. Lifted from
// finanssi with its tests.
// ---------------------------------------------------------------------------

describe("Checkbox", () => {
  it("is a real checkbox named by its label text, and the text toggles it", () => {
    const onChange = jest.fn();
    render(
      <Checkbox id="cb" checked={false} onChange={onChange}>
        All entries
      </Checkbox>,
    );
    const box = screen.getByRole("checkbox", { name: "All entries" });
    expect(box).not.toBeChecked();
    fireEvent.click(screen.getByText("All entries"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports unticking as false", () => {
    const onChange = jest.fn();
    render(
      <Checkbox id="cb" checked onChange={onChange}>
        Oats
      </Checkbox>,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Oats" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("renders bare, named by aria-label, without label text", () => {
    render(<Checkbox aria-label="Choose row" checked={false} onChange={jest.fn()} />);
    expect(screen.getByRole("checkbox", { name: "Choose row" })).toBeInTheDocument();
    expect(screen.queryByText("Choose row")).toBeNull();
  });

  it("sets the indeterminate property, which JSX cannot express", () => {
    const { rerender } = render(<Checkbox aria-label="All" checked={false} onChange={jest.fn()} />);
    const box = screen.getByRole("checkbox", { name: "All" }) as HTMLInputElement;
    expect(box.indeterminate).toBe(false);
    rerender(<Checkbox aria-label="All" checked={false} indeterminate onChange={jest.fn()} />);
    expect(box.indeterminate).toBe(true);
    rerender(<Checkbox aria-label="All" checked onChange={jest.fn()} />);
    expect(box.indeterminate).toBe(false);
  });

  it("is the accent when ticked or partial, never a macro's hue", () => {
    render(<Checkbox aria-label="All" checked onChange={jest.fn()} />);
    const tokens = screen.getByRole("checkbox").className.split(/\s+/);
    for (const t of ["checked:bg-accent", "checked:border-accent", "indeterminate:bg-accent"]) {
      expect(tokens).toContain(t);
    }
    expect(tokens.filter((t) => /energy|protein|carbs|fat/.test(t))).toEqual([]);
  });
});
