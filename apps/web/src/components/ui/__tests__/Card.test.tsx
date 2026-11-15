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
    expect(content.parentElement).toHaveClass("rounded-card", "border-rule", "bg-surface");
  });

  it("defaults to generous padding, switches to dense when asked", () => {
    const { rerender } = render(
      <Card>
        <p>Body</p>
      </Card>,
    );
    expect(screen.getByText("Body").parentElement).toHaveClass("p-5", "md:p-6");

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
        <Card.Header title="Account" action={<button type="button">Edit</button>} />
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("is a region named by its header when labelled", () => {
    render(
      <Card labelledBy="card-title">
        <Card.Header id="card-title" title="Appearance" />
      </Card>,
    );
    expect(screen.getByRole("region", { name: "Appearance" })).toBeInTheDocument();
  });
});
