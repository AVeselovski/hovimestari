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
});
