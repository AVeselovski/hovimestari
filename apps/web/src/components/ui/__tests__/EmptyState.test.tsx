import { render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState title="Nothing here yet." />);
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("renders the body only when provided", () => {
    const { rerender } = render(<EmptyState title="Nothing here yet." />);
    expect(screen.queryByText("A second line.")).not.toBeInTheDocument();
    rerender(<EmptyState title="Nothing here yet." body="A second line." />);
    expect(screen.getByText("A second line.")).toBeInTheDocument();
  });

  it("renders the action only when provided", () => {
    const { rerender } = render(<EmptyState title="Nothing here yet." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<EmptyState title="Nothing here yet." action={<button type="button">Add</button>} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});
