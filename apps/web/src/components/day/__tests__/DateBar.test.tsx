import { fireEvent, render, screen } from "@testing-library/react";
import { DateBar } from "../DateBar";
import { TODAY } from "./support";

describe("DateBar", () => {
  const showPicker = jest.fn();
  beforeEach(() => {
    showPicker.mockReset();
    Object.defineProperty(HTMLInputElement.prototype, "showPicker", { value: showPicker, configurable: true });
  });
  afterAll(() => {
    delete (HTMLInputElement.prototype as { showPicker?: unknown }).showPicker;
  });

  const label = () => document.querySelector("[data-date-label]")!.textContent;
  const dateInput = () => document.querySelector<HTMLInputElement>('input[type="date"]')!;

  it("names today, yesterday and tomorrow, and any other date short, a far one with its year and no comma", () => {
    const { rerender } = render(<DateBar date={TODAY} today={TODAY} onChange={jest.fn()} />);
    expect(label()).toBe("Today");
    rerender(<DateBar date="2026-11-15" today={TODAY} onChange={jest.fn()} />);
    expect(label()).toBe("Yesterday");
    rerender(<DateBar date="2026-11-17" today={TODAY} onChange={jest.fn()} />);
    expect(label()).toBe("Tomorrow");
    rerender(<DateBar date="2026-11-20" today={TODAY} onChange={jest.fn()} />);
    expect(label()).toBe(
      new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
        new Date("2026-11-20"),
      ),
    );
    rerender(<DateBar date="2025-03-02" today={TODAY} onChange={jest.fn()} />);
    expect(label()).toMatch(/2025$/);
    expect(label()).not.toMatch(/\d{1,2} \S+, 2025|, 2025/);
  });

  it("is one Tab stop: a button named for the day, while the date input stays out of the Tab order", () => {
    render(<DateBar date={TODAY} today={TODAY} onChange={jest.fn()} />);
    const choose = screen.getByRole("button", { name: "Choose a date, Today" });
    expect(choose.tagName).toBe("BUTTON");
    expect(dateInput()).toHaveAttribute("tabindex", "-1");
    const stops = [...document.querySelectorAll<HTMLElement>("button, input")].filter((el) => el.tabIndex >= 0);
    expect(stops.map((el) => el.getAttribute("aria-label"))).toEqual([
      "Previous day",
      "Choose a date, Today",
      "Next day",
    ]);
  });

  it("opens the platform's picker from the button's click, which Enter and Space make, and from a click on the input", () => {
    render(<DateBar date={TODAY} today={TODAY} onChange={jest.fn()} />);
    const choose = screen.getByRole("button", { name: "Choose a date, Today" });
    fireEvent.click(choose);
    expect(showPicker).toHaveBeenCalledTimes(1);
    fireEvent.click(dateInput());
    expect(showPicker).toHaveBeenCalledTimes(2);
  });

  it("applies a picker's whole date at once, and nothing for an empty one", () => {
    const onChange = jest.fn();
    render(<DateBar date={TODAY} today={TODAY} onChange={onChange} />);
    fireEvent.pointerDown(dateInput());
    fireEvent.change(dateInput(), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(dateInput(), { target: { value: "2026-11-02" } });
    expect(onChange).toHaveBeenCalledWith("2026-11-02");
    fireEvent.blur(dateInput());
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("applies typed digits only on Enter or blur, never a year still being typed", () => {
    const onChange = jest.fn();
    render(<DateBar date={TODAY} today={TODAY} onChange={onChange} />);
    const input = dateInput();
    input.focus();
    // Typing 2026 into the year passes through 0002, 0020 and 0202.
    for (const value of ["0002-11-16", "0020-11-16", "0202-11-16"]) {
      fireEvent.keyDown(input, { key: value[3] });
      fireEvent.change(input, { target: { value } });
    }
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "6" });
    fireEvent.change(input, { target: { value: "2025-11-16" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("2025-11-16");
    fireEvent.keyDown(input, { key: "1" });
    fireEvent.change(input, { target: { value: "2025-11-10" } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenLastCalledWith("2025-11-10");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("applies a date picked in a picker opened from the keyboard at once, though the last key was Enter on the button", () => {
    const onChange = jest.fn();
    render(<DateBar date={TODAY} today={TODAY} onChange={onChange} />);
    const choose = screen.getByRole("button", { name: "Choose a date, Today" });
    choose.focus();
    // Enter on the button reaches the document; the picker's own keys never do.
    fireEvent.keyDown(choose, { key: "Enter" });
    fireEvent.click(choose, { detail: 0 });
    expect(showPicker).toHaveBeenCalledTimes(1);
    fireEvent.change(dateInput(), { target: { value: "2026-11-17" } });
    expect(onChange).toHaveBeenCalledWith("2026-11-17");
  });

  it("forgets digits typed earlier once the picker opens again, so its choice applies at once", () => {
    const onChange = jest.fn();
    render(<DateBar date={TODAY} today={TODAY} onChange={onChange} />);
    const input = dateInput();
    input.focus();
    fireEvent.keyDown(input, { key: "1" });
    fireEvent.change(input, { target: { value: "2026-11-11" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(input);
    fireEvent.change(input, { target: { value: "2026-11-12" } });
    expect(onChange).toHaveBeenCalledWith("2026-11-12");
  });

  it("puts the shown day back in the input when a half typed date loses focus", () => {
    const onChange = jest.fn();
    render(<DateBar date={TODAY} today={TODAY} onChange={onChange} />);
    const input = dateInput();
    input.focus();
    fireEvent.keyDown(input, { key: "2" });
    fireEvent.change(input, { target: { value: "0202-11-16" } });
    fireEvent.blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe(TODAY);
  });

  it("moves a day with each chevron", () => {
    const onChange = jest.fn();
    render(<DateBar date={TODAY} today={TODAY} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    expect(onChange.mock.calls).toEqual([["2026-11-15"], ["2026-11-17"]]);
  });
});
