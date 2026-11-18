import { act, render, screen } from "@testing-library/react";
import { DayHeader } from "../DayHeader";

// The Day tab's header stays at the top of <main> while the day scrolls under
// it. Layout is the browser's: these pin the rules a class can state, and the
// hairline's state, which follows <main>'s scroll position. The positions
// themselves are measured in a real browser (docs/app/day.md, Layout).

const classes = (el: Element): string[] => el.className.split(/\s+/).filter(Boolean);

/** A <main> whose scroll position the test sets, as the browser would after a scroll. */
function renderInMain(): { main: HTMLElement; header: HTMLElement; scrollTo: (top: number) => void } {
  render(
    <main>
      <DayHeader>
        <p>Date bar</p>
        <p>Launcher</p>
      </DayHeader>
      <p>Summary</p>
    </main>,
  );
  const main = screen.getByRole("main");
  let top = 0;
  Object.defineProperty(main, "scrollTop", { configurable: true, get: () => top });
  const header = screen.getByText("Date bar").parentElement!;
  return {
    main,
    header,
    scrollTo: (next) =>
      act(() => {
        top = next;
        main.dispatchEvent(new Event("scroll"));
      }),
  };
}

describe("DayHeader", () => {
  it("stays at the top of the page's scroll container, above its content and under the shell, on the page's own solid background", () => {
    const { header } = renderInMain();
    expect(classes(header)).toEqual(expect.arrayContaining(["sticky", "top-0", "z-20", "bg-bg"]));
    expect(classes(header).filter((c) => /^(fixed|absolute|overflow-)/.test(c))).toEqual([]);
  });

  it("draws no blur, shadow, gradient or transition", () => {
    const { header } = renderInMain();
    expect(
      classes(header).filter((c) => /(blur|shadow|gradient|backdrop|transition|duration|opacity)/.test(c)),
    ).toEqual([]);
  });

  it("keeps the room above itself and the clearance under the launcher from the header tokens", () => {
    const { header } = renderInMain();
    expect(classes(header)).toEqual(
      expect.arrayContaining([
        "pt-(--day-header-top)",
        "gap-(--day-header-gap)",
        "pb-[calc(var(--day-header-clear)-1px)]",
      ]),
    );
  });

  it("shows the rule colour on its bottom edge only while content is scrolled under it, and keeps the same edge at rest", () => {
    const { header, scrollTo } = renderInMain();
    const atRest = classes(header);
    expect(header).not.toHaveAttribute("data-scrolled");
    // The edge is there at rest in the page colour, so the header never changes height.
    expect(atRest).toEqual(expect.arrayContaining(["border-b", "border-bg", "data-scrolled:border-rule"]));

    scrollTo(240);
    expect(header).toHaveAttribute("data-scrolled");
    expect(classes(header)).toEqual(atRest);

    scrollTo(0);
    expect(header).not.toHaveAttribute("data-scrolled");
    expect(classes(header)).toEqual(atRest);
  });

  it("reads a page already scrolled when it mounts", () => {
    const main = document.createElement("main");
    Object.defineProperty(main, "scrollTop", { configurable: true, get: () => 120 });
    document.body.append(main);
    render(
      <DayHeader>
        <p>Date bar</p>
      </DayHeader>,
      { container: main },
    );
    expect(screen.getByText("Date bar").parentElement).toHaveAttribute("data-scrolled");
    main.remove();
  });
});
