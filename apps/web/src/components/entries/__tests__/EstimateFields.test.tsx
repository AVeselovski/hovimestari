import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import type { EntryFieldErrors } from "../entryForm";
import { EstimateFields, type EstimateField } from "../EstimateFields";

// An estimate's fields: the name and the note at full width, the four figures
// as a two by two grid with one shared line per row. Their room is measured
// at 320 pixels in a browser. These pin the structure that keeps it: every
// row's line is always there with one line of room, and the order.

const EMPTY = { name: "", energy: "", protein: "", carbs: "", fat: "", note: "" };

function Fields({ errors = {} }: { errors?: EntryFieldErrors }): ReactElement {
  const [fields, setFields] = useState(EMPTY);
  return (
    <form>
      <EstimateFields
        idPrefix="e"
        fields={fields}
        errors={errors}
        onChange={(field: EstimateField, value) => setFields((f) => ({ ...f, [field]: value }))}
        autoFocus={false}
      />
    </form>
  );
}

const input = (name: string) => screen.getByRole("textbox", { name }) as HTMLInputElement;

describe("EstimateFields", () => {
  it("takes the fields in the order Name, Calories, Protein, Carbohydrates, Fat, Note", () => {
    render(<Fields />);
    expect(screen.getAllByRole("textbox").map((el) => el.getAttribute("name"))).toEqual([
      "name",
      "energy",
      "protein",
      "carbs",
      "fat",
      "note",
    ]);
  });

  it("lays the figures out two by two, each with its unit, with one line under the grid that keeps one line of room", () => {
    render(<Fields />);
    const group = document.querySelector<HTMLElement>("[data-figure-fields]")!;
    const grid = group.firstElementChild!;
    expect(grid.className.split(" ")).toEqual(expect.arrayContaining(["grid", "grid-cols-2"]));
    expect([...grid.querySelectorAll("input")].map((i) => i.name)).toEqual(["energy", "protein", "carbs", "fat"]);
    expect(group).toHaveTextContent(/Calories.*kcal.*Protein.*g.*Carbohydrates.*g.*Fat.*g/);
    const line = group.lastElementChild!;
    expect(line.tagName).toBe("P");
    expect(line.className.split(" ")).toContain("min-h-5");
  });

  it("keeps the name's and the note's one line of room, and the grid's room, with and without a refusal", () => {
    const { rerender } = render(<Fields />);
    const line = () => document.querySelector<HTMLElement>("[data-figure-fields]")!.lastElementChild!;
    expect(line().className.split(" ")).toContain("min-h-5");
    rerender(<Fields errors={{ name: "name_required", protein: "figure_invalid", fat: "digit_group" }} />);
    expect(line().className.split(" ")).toContain("min-h-5");
    for (const id of ["e-name-line", "e-note-line"]) {
      expect(document.getElementById(id)!.className.split(" ")).toContain("min-h-5");
    }
  });

  it("says the first refused figure's reason under the grid, and describes every refused figure by it", () => {
    render(<Fields errors={{ protein: "figure_invalid", fat: "digit_group" }} />);
    const line = document.querySelector<HTMLElement>("[data-figure-fields]")!.lastElementChild!;
    expect(line).toHaveTextContent("Up to 10000 kcal or 1000 g, one decimal.");
    expect(input("Protein")).toHaveAttribute("aria-invalid", "true");
    expect(input("Fat")).toHaveAttribute("aria-invalid", "true");
    expect(input("Protein")).toHaveAccessibleDescription(/Up to 10000.kcal or 1000.g, one decimal/);
    expect(input("Fat")).toHaveAccessibleDescription(/Up to 10000.kcal or 1000.g, one decimal/);
    expect(input("Calories")).not.toHaveAttribute("aria-invalid");
  });

  it("moves from Name to Calories on Enter, without submitting", () => {
    const submit = jest.fn((e: Event) => e.preventDefault());
    render(<Fields />);
    document.querySelector("form")!.addEventListener("submit", submit);
    input("Name").focus();
    fireEvent.keyDown(input("Name"), { key: "Enter" });
    expect(input("Calories")).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
  });
});
