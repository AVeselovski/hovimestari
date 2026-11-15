import { render, screen } from "@testing-library/react";
import { EmptyState } from "../EmptyState";

describe("EmptyState", () => {
  it("renders the title", () => {
    render(<EmptyState icon="buckets" title="No buckets yet" />);
    expect(screen.getByText("No buckets yet")).toBeInTheDocument();
  });

  it("renders the body only when provided", () => {
    const { rerender } = render(<EmptyState icon="buckets" title="No buckets yet" />);
    expect(screen.queryByText("Create your first bucket to get started.")).not.toBeInTheDocument();

    rerender(<EmptyState icon="buckets" title="No buckets yet" body="Create your first bucket to get started." />);
    expect(screen.getByText("Create your first bucket to get started.")).toBeInTheDocument();
  });

  it("renders the action only when provided", () => {
    const { rerender } = render(<EmptyState icon="buckets" title="No buckets yet" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <EmptyState icon="buckets" title="No buckets yet" action={<button type="button">Create bucket</button>} />,
    );
    expect(screen.getByRole("button", { name: "Create bucket" })).toBeInTheDocument();
  });

  it("renders the icon as decorative (hidden from assistive tech)", () => {
    const { container } = render(<EmptyState icon="buckets" title="No buckets yet" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("defaults to the default size (min-h-48/py-8) when size is omitted", () => {
    const { container } = render(<EmptyState icon="buckets" title="No buckets yet" />);
    const root = container.firstElementChild;
    expect(root).toHaveClass("min-h-48");
    expect(root).toHaveClass("py-8");
    expect(root).not.toHaveClass("min-h-0");
    expect(root).not.toHaveClass("py-4");
  });

  it('renders compact sizing (min-h-0/py-4) and never the default sizing when size="compact"', () => {
    const { container } = render(<EmptyState icon="buckets" title="No buckets yet" size="compact" />);
    const root = container.firstElementChild;
    expect(root).toHaveClass("min-h-0");
    expect(root).toHaveClass("py-4");
    expect(root).not.toHaveClass("min-h-48");
    expect(root).not.toHaveClass("py-8");
  });
});
