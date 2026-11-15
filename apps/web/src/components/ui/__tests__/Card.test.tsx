import { render, screen } from "@testing-library/react";
import { Card } from "../Card";

describe("Card", () => {
  it("renders its children inside a card-styled panel", () => {
    render(
      <Card>
        <p>Card body</p>
      </Card>,
    );
    const content = screen.getByText("Card body");
    expect(content.parentElement).toHaveClass("rounded-card", "border-line-subtle", "bg-surface-1");
  });

  it("defaults to generous padding, switches to dense when asked", () => {
    const { rerender } = render(
      <Card>
        <p>Body</p>
      </Card>,
    );
    expect(screen.getByText("Body").parentElement).toHaveClass("p-6");

    rerender(
      <Card padding="dense">
        <p>Body</p>
      </Card>,
    );
    expect(screen.getByText("Body").parentElement).toHaveClass("p-4");
  });

  it("Card.Header renders a title and an optional trailing action", () => {
    render(
      <Card>
        <Card.Header title="Recent transactions" action={<button type="button">See all</button>} />
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Recent transactions" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "See all" })).toBeInTheDocument();
  });
});
