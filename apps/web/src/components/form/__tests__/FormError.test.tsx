import { FormError } from "@/components/form/FormError";
import { revealPageRefusal } from "@/lib/revealRefused";
import { render, screen } from "@testing-library/react";

jest.mock("@/lib/revealRefused", () => ({
  ...jest.requireActual("@/lib/revealRefused"),
  revealPageRefusal: jest.fn(),
}));

const reveal = revealPageRefusal as jest.MockedFunction<typeof revealPageRefusal>;

beforeEach(() => reveal.mockClear());

describe("FormError", () => {
  it("on a page, brings itself into view when a refusal appears, and not while it is empty", () => {
    const { rerender } = render(<FormError message={null} />);
    expect(reveal).not.toHaveBeenCalled();
    rerender(<FormError message="Invalid email or password." />);
    const line = screen.getByRole("alert");
    expect(line).toHaveTextContent("Invalid email or password.");
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith(line);
  });

  it("in a sheet's footer, leaves the scrolling to the sheet", () => {
    const { rerender } = render(<FormError message={null} inFooter />);
    rerender(<FormError message="Invalid email or password." inFooter />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email or password.");
    expect(reveal).not.toHaveBeenCalled();
  });
});
