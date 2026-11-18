import { render, screen, within } from "@testing-library/react";
import { StateChoice } from "../StateChoice";

// Eaten or planned from md sits beside a name field, 48 pixels tall: the
// tray's 1 pixel border and 2 pixel padding on each side around 42 pixel
// options. On a phone the options keep their 44 pixel targets.

describe("StateChoice", () => {
  it("is as tall as a field from md, and keeps 44 pixel options on a phone", () => {
    render(<StateChoice id="state" value="eaten" onChange={jest.fn()} future={false} />);
    const tray = screen.getByRole("radiogroup");
    const trayTokens = tray.className.split(" ");
    expect(trayTokens).toEqual(expect.arrayContaining(["border", "p-1", "md:p-0.5"]));
    for (const option of within(tray).getAllByRole("radio")) {
      expect(option.className.split(" ")).toEqual(expect.arrayContaining(["min-h-11", "md:min-h-10.5"]));
    }
  });

  it("keeps no line under the group on a day that can be either, and 16 pixels to the block under it", () => {
    const { container } = render(<StateChoice id="state" value="eaten" onChange={jest.fn()} future={false} />);
    const tray = screen.getByRole("radiogroup");
    expect(tray.nextElementSibling).toBeNull();
    expect(tray).not.toHaveAttribute("aria-describedby");
    const block = container.firstElementChild!;
    expect(block.className.split(/\s+/)).toEqual(["not-last:mb-2"]);
  });

  it("says why under the group on a future day, as a field's line", () => {
    const { container } = render(<StateChoice id="state" value="eaten" onChange={jest.fn()} future />);
    const tray = screen.getByRole("radiogroup");
    const line = tray.nextElementSibling!;
    expect(line).toHaveTextContent("Future days hold planned entries.");
    expect(line.className.split(/\s+/)).toEqual(expect.arrayContaining(["mt-1.5", "min-h-5", "text-ink-muted"]));
    expect(tray).toHaveAccessibleDescription("Future days hold planned entries.");
    // The line sets the block apart, as a field's does: no extra margin.
    expect(container.firstElementChild!.className.split(/\s+/)).not.toContain("not-last:mb-2");
    expect(within(tray).getByRole("radio", { name: "Eaten" })).toHaveAttribute("aria-disabled", "true");
  });

  it("leaves the reason to another line when given one, and points the group at it", () => {
    render(
      <>
        <StateChoice id="state" value="eaten" onChange={jest.fn()} future reason={{ id: "date-line", shown: true }} />
        <p id="date-line">Future days hold planned entries.</p>
      </>,
    );
    const tray = screen.getByRole("radiogroup");
    expect(tray.nextElementSibling).toBeNull();
    expect(tray).toHaveAttribute("aria-describedby", "date-line");
  });

  it("points the group at nothing while the other line says nothing, and draws no line of its own", () => {
    render(
      <StateChoice id="state" value="eaten" onChange={jest.fn()} future reason={{ id: "date-line", shown: false }} />,
    );
    const tray = screen.getByRole("radiogroup");
    expect(tray).not.toHaveAttribute("aria-describedby");
    expect(tray.nextElementSibling).toBeNull();
  });
});
