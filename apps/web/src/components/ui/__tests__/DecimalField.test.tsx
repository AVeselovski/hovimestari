import { DecimalField, type DecimalFieldProps } from "@/components/ui/DecimalField";
import { fireEvent, render, screen } from "@testing-library/react";

function renderField(props: Partial<DecimalFieldProps> = {}) {
  const onValueChange = jest.fn();
  render(
    <DecimalField
      id="protein"
      name="protein"
      label="Protein"
      unit="g"
      inputMode="decimal"
      value=""
      onValueChange={onValueChange}
      {...props}
    />,
  );
  return { input: screen.getByLabelText("Protein"), onValueChange };
}

/** The ids a field's `aria-describedby` names, as a list. */
const describedBy = (el: HTMLElement) => (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);

describe("DecimalField", () => {
  it("is a text field with the keypad it is given, and no placeholder", () => {
    const { input } = renderField({ inputMode: "numeric" });
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).not.toHaveAttribute("placeholder");
  });

  it("passes the decimal keypad through", () => {
    expect(renderField().input).toHaveAttribute("inputmode", "decimal");
  });

  it("hands every keystroke over as typed, comma included", () => {
    const { input, onValueChange } = renderField();
    fireEvent.change(input, { target: { value: "120,5" } });
    expect(onValueChange).toHaveBeenCalledWith("120,5");
  });

  it("reads its unit after its label", () => {
    const { input } = renderField();
    expect(describedBy(input)).toEqual(["protein-unit"]);
    expect(document.getElementById("protein-unit")).toHaveTextContent("g");
  });

  it("points at a line it shares with another field, and has no line of its own", () => {
    render(<p id="pair-line">The lower number is your floor.</p>);
    const { input } = renderField({ describedBy: "pair-line" });
    expect(describedBy(input)).toEqual(["protein-unit", "pair-line"]);
    expect(document.getElementById("protein-line")).toBeNull();
    expect(input).toHaveAccessibleDescription("g The lower number is your floor.");
  });

  it("keeps a line of its own, read after its unit, holding the hint", () => {
    const { input } = renderField({ line: "From the label." });
    expect(describedBy(input)).toEqual(["protein-unit", "protein-line"]);
    expect(input).toHaveAccessibleDescription("g From the label.");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("keeps its own line's room while it is empty, so an error appearing moves nothing", () => {
    const { input } = renderField({ line: "" });
    const line = document.getElementById("protein-line");
    expect(line).toBeInTheDocument();
    expect(line?.className.split(/\s+/)).toContain("min-h-5");
    expect(describedBy(input)).toContain("protein-line");
  });

  it("marks itself invalid with its error in its own line", () => {
    const { input } = renderField({ line: "Enter a number.", invalid: true });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("g Enter a number.");
  });

  it("labels the Enter key next by default, and as the caller chooses on the last field", () => {
    expect(renderField().input).toHaveAttribute("enterkeyhint", "next");
  });

  it("takes done for the last field", () => {
    expect(renderField({ enterKeyHint: "done" }).input).toHaveAttribute("enterkeyhint", "done");
  });
});
