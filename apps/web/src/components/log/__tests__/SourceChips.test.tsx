import { render, screen, within } from "@testing-library/react";
import { SourceChips } from "../SourceChips";

// No source chip pushes past its row: a label longer than the row is cut at
// the row's width, so the row still scrolls as one row on a phone.

describe("SourceChips", () => {
  it("cuts a long source at its row's width", () => {
    render(
      <SourceChips sources={["Lähikahvila Mustikkamäen Kulmakeittiö", "Wolt"]} value={null} onChange={jest.fn()} />,
    );
    for (const chip of within(screen.getByRole("radiogroup")).getAllByRole("radio")) {
      expect(chip.className.split(" ")).toEqual(expect.arrayContaining(["max-w-full", "truncate", "shrink-0"]));
    }
  });

  it("shows a source's whole name on hover, and All has none", () => {
    render(
      <SourceChips sources={["Lähikahvila Mustikkamäen Kulmakeittiö", "Wolt"]} value={null} onChange={jest.fn()} />,
    );
    expect(screen.getByRole("radio", { name: "All" })).not.toHaveAttribute("title");
    expect(screen.getByRole("radio", { name: "Lähikahvila Mustikkamäen Kulmakeittiö" })).toHaveAttribute(
      "title",
      "Lähikahvila Mustikkamäen Kulmakeittiö",
    );
  });
});
