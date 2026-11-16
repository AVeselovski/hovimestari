import { NativeDateInput } from "@/components/ui/NativeDateInput";
import { render, screen } from "@testing-library/react";

function renderField(props: { error?: string | null; hint?: string | null; lineRoom?: string } = {}) {
  render(
    <>
      <label htmlFor="d">Starts on</label>
      <NativeDateInput id="d" value="2026-11-16" onValueChange={() => {}} {...props} />
    </>,
  );
  return { input: screen.getByLabelText("Starts on"), line: document.getElementById("d-line")! };
}

describe("NativeDateInput", () => {
  it("keeps an empty line of one line's room, described by nothing", () => {
    const { input, line } = renderField();
    expect(line).toBeEmptyDOMElement();
    expect(line.className.split(/\s+/)).toContain("min-h-5");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("shows a hint in that line, read after the label and announced", () => {
    const { input, line } = renderField({ hint: "In force on this date.", lineRoom: "min-h-10" });
    expect(line).toHaveTextContent("In force on this date.");
    expect(line).toHaveAttribute("aria-live", "polite");
    expect(line.className.split(/\s+/)).toContain("min-h-10");
    expect(input).toHaveAccessibleDescription("In force on this date.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("puts an error in the hint's place, in the same line", () => {
    const { input, line } = renderField({
      hint: "In force on this date.",
      error: "Enter a valid date.",
      lineRoom: "min-h-10",
    });
    expect(line).toHaveTextContent("Enter a valid date.");
    expect(line).not.toHaveTextContent("In force");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid date.");
  });
});
