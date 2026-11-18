import { NativeDateInput, dateHintId } from "@/components/ui/NativeDateInput";
import { render, screen } from "@testing-library/react";

function renderField(props: { error?: string | null; hint?: string | null } = {}) {
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
    expect(line).toHaveTextContent("");
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

  it("shows a hint in that line from a live span of its own, which another control can name", () => {
    const { input, line } = renderField({ hint: "Future days hold planned entries." });
    const hint = document.getElementById(dateHintId("d"))!;
    expect(line).toContainElement(hint);
    expect(hint).toHaveTextContent("Future days hold planned entries.");
    expect(hint).toHaveAttribute("aria-live", "polite");
    expect(input).toHaveAccessibleDescription("Future days hold planned entries.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("keeps an error out of the live span: it is read as the field's description only, never as the hint", () => {
    const { line } = renderField({ error: "Enter a valid date.", hint: "Future days hold planned entries." });
    const hint = document.getElementById(dateHintId("d"))!;
    expect(line).toHaveTextContent("Enter a valid date.");
    expect(hint).toHaveTextContent("");
    expect(line.closest("[aria-live]")).toBeNull();
  });
});
