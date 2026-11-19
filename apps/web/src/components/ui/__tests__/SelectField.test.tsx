import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { SelectField } from "../SelectField";
import { selectFieldChevron, selectFieldClass, selectFieldWrap } from "../styles";

// The app's one select: a native <select> (the phone's own picker), with the
// browser's arrow off and the app's chevron drawn over its right edge, in a
// form field's shape.
describe("SelectField", () => {
  function renderField(props: Partial<React.ComponentProps<typeof SelectField>> = {}) {
    const onChange = jest.fn();
    render(
      <>
        <label htmlFor="pick">Key expires after</label>
        <SelectField id="pick" value="b" onChange={onChange} {...props}>
          <option value="a">7 days</option>
          <option value="b">30 days</option>
        </SelectField>
      </>,
    );
    return { onChange, select: screen.getByLabelText("Key expires after") as HTMLSelectElement };
  }

  it("is a native select named by its label, that passes its props and changes through", () => {
    const { select, onChange } = renderField({ "aria-describedby": "line" });
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("b");
    expect(select).toHaveAttribute("aria-describedby", "line");
    fireEvent.change(select, { target: { value: "a" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("takes a field's shape, with the browser's arrow off and the app's chevron beside it, hidden from readers", () => {
    const { select } = renderField();
    expect(select.className.split(" ")).toEqual(
      expect.arrayContaining(["h-12", "w-full", "text-base", "appearance-none"]),
    );
    expect(select.className).toBe(selectFieldClass);
    expect(select.parentElement!.className).toBe(selectFieldWrap);
    const chevron = select.parentElement!.querySelector("svg")!;
    expect(chevron.getAttribute("class")).toBe(selectFieldChevron);
    expect(chevron.getAttribute("class")!.split(" ")).toContain("pointer-events-none");
    expect(chevron.getAttribute("aria-hidden")).toBe("true");
  });

  it("puts its className on the box, not the select", () => {
    const { select } = renderField({ className: "mt-1" });
    expect(select.parentElement!.className.split(" ")).toContain("mt-1");
    expect(select.className.split(" ")).not.toContain("mt-1");
  });

  it("hands its ref to the select", () => {
    const ref = createRef<HTMLSelectElement>();
    const { select } = renderField({ ref });
    expect(ref.current).toBe(select);
  });
});
