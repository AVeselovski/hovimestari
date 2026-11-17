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
  return { input: screen.getByLabelText(props.label ?? "Protein"), onValueChange };
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

  it("keeps room at its end for its unit: g the least, kcal more, a word unit such as portions the most", () => {
    const classes = (unit: string) => {
      const { input } = renderField({ unit, id: unit, label: unit });
      return input.className.split(" ");
    };
    // Measured at 320 px: "g" is about 9 px wide, "kcal" about 31 px and "portions" 62 px, after a 14 px inset.
    expect(classes("g")).toContain("pr-7");
    expect(classes("kcal")).toContain("pr-12");
    expect(classes("portions")).toContain("pr-22");
    expect(classes("meals")).toContain("pr-22");
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

  it("puts the label beside a 9rem field with layout beside, and the line under the pair", () => {
    const { input } = renderField({ layout: "beside", line: "Enter a value.", invalid: true, lineRows: 2 });
    const row = input.parentElement!.parentElement!;
    expect(row.className.split(" ")).toEqual(["flex", "items-center", "gap-3"]);
    expect(row.firstElementChild!.tagName).toBe("LABEL");
    expect(input.parentElement!.className.split(" ")).toEqual(["relative", "w-36", "shrink-0"]);
    const line = document.getElementById("protein-line")!;
    expect(line.parentElement).toBe(row.parentElement);
    expect(line.className.split(" ")).toContain("min-h-10");
    expect(describedBy(input)).toEqual(["protein-unit", "protein-line"]);
  });

  // "1234,5" is 58 px in the mono face and "99,75" 48 px: 9rem less a word unit's 5.5rem leaves 40.
  it("is 11rem beside its label when its unit is a word, so a long value shows in full", () => {
    const box = (unit: string) => renderField({ layout: "beside", unit, id: unit, label: unit }).input.parentElement!;
    expect(box("portions").className.split(" ")).toEqual(["relative", "w-44", "shrink-0"]);
    expect(box("meals").className.split(" ")).toEqual(["relative", "w-44", "shrink-0"]);
    expect(box("kcal").className.split(" ")).toEqual(["relative", "w-36", "shrink-0"]);
  });

  it("keeps its width beside its label as its unit changes, taking it from the widest unit it can show", () => {
    const onValueChange = jest.fn();
    const field = (unit: string) => (
      <DecimalField
        id="amount"
        name="amount"
        label="Amount"
        unit={unit}
        widestUnit="portions"
        inputMode="decimal"
        value="1234,5"
        onValueChange={onValueChange}
        layout="beside"
      />
    );
    const { rerender } = render(field("g"));
    const width = () => screen.getByLabelText("Amount").parentElement!.className.split(" ");
    const before = width();
    rerender(field("portions"));
    expect(width()).toEqual(before);
    expect(before).toContain("w-44");
  });
});
