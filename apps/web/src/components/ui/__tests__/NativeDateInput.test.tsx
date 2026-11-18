import { NativeDateInput } from "@/components/ui/NativeDateInput";
import { render, screen } from "@testing-library/react";

function renderField(props: { error?: string | null } = {}) {
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

  it("shows an error in that line, read after the label", () => {
    const { input, line } = renderField({ error: "Enter a valid date." });
    expect(line).toHaveTextContent("Enter a valid date.");
    expect(line.className.split(/\s+/)).toContain("min-h-5");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Enter a valid date.");
  });
});
