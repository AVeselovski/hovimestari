import { revealPageRefusal, revealRefused } from "../revealRefused";

// A refused field taller than the body around it: a figure in the 2 by 2
// grid, whose block is the whole grid and its shared line, above a phone's
// keyboard. jsdom has no layout, so each box is given as a browser reports
// it: the body is a fixed window, and everything in it moves up by its
// scrollTop. The real geometry is measured in a browser at 320 by 568.

const VIEW = { top: 100, bottom: 260 };

/** Where each element sits in the scrolled content: top and bottom. */
const CONTENT: Record<string, [number, number]> = {
  grid: [0, 300],
  "energy-label": [0, 20],
  energy: [26, 74],
  "fat-label": [176, 196],
  fat: [200, 248],
  line: [260, 300],
};

function build(refused: string): { body: HTMLElement; form: HTMLFormElement } {
  document.body.innerHTML = `
    <div data-sheet-body>
      <form>
        <div data-el="grid">
          <label for="energy" data-el="energy-label">Calories</label>
          <input id="energy" data-el="energy" aria-describedby="line" />
          <label for="fat" data-el="fat-label">Fat</label>
          <input id="fat" data-el="fat" aria-describedby="line" />
          <p id="line" data-el="line">Enter a value.</p>
        </div>
      </form>
    </div>`;
  const body = document.querySelector<HTMLElement>("[data-sheet-body]")!;
  body.getBoundingClientRect = () => ({ ...VIEW, height: VIEW.bottom - VIEW.top }) as DOMRect;
  for (const el of document.querySelectorAll<HTMLElement>("[data-el]")) {
    const [top, bottom] = CONTENT[el.dataset.el!];
    el.getBoundingClientRect = () =>
      ({ top: VIEW.top + top - body.scrollTop, bottom: VIEW.top + bottom - body.scrollTop }) as DOMRect;
  }
  document.getElementById(refused)!.setAttribute("aria-invalid", "true");
  document.getElementById(refused)!.focus();
  return { body, form: document.querySelector("form")! };
}

const onScreen = (id: string): [number, number] => {
  const r = document.querySelector<HTMLElement>(`[data-el="${id}"]`)!.getBoundingClientRect();
  return [r.top, r.bottom];
};
const inView = ([top, bottom]: [number, number]) => top >= VIEW.top && bottom <= VIEW.bottom;

describe("revealRefused, a field whose block is taller than the body", () => {
  it("brings the refused field, its label and its line into view when they fit together", () => {
    const { body, form } = build("fat");
    expect(inView(onScreen("fat"))).toBe(false);
    revealRefused(form);
    expect(inView(onScreen("fat"))).toBe(true);
    expect(inView(onScreen("fat-label"))).toBe(true);
    expect(inView(onScreen("line"))).toBe(true);
    expect(body.scrollTop).toBe(140);
  });

  it("moves nothing when the refused field is in view and cannot show with its line", () => {
    const { body, form } = build("energy");
    revealRefused(form);
    expect(body.scrollTop).toBe(0);
    expect(inView(onScreen("energy"))).toBe(true);
  });

  it("brings the field and its label in alone from below when they cannot show with the line", () => {
    const { body, form } = build("energy");
    body.scrollTop = 200;
    revealRefused(form);
    expect(inView(onScreen("energy"))).toBe(true);
    expect(inView(onScreen("energy-label"))).toBe(true);
    expect(body.scrollTop).toBe(0);
  });
});

describe("revealRefused, a body shorter than a field and its label", () => {
  it("brings the field itself into view", () => {
    const { body, form } = build("fat");
    // A body 60 px tall: the field (48) fits, the field and its label (72) do not.
    body.getBoundingClientRect = () => ({ top: 100, bottom: 160, height: 60 }) as DOMRect;
    revealRefused(form);
    const [top, bottom] = onScreen("fat");
    expect(top).toBeGreaterThanOrEqual(100);
    expect(bottom).toBeLessThanOrEqual(160);
  });
});

describe("revealRefused, a block that fits in a body that shows the field, its label and its line", () => {
  // A body 320 px tall, which the whole grid (300) fits. Scrolled 30 px, the
  // grid's top is out of view, while Fat, its label and the shared line are in.
  const TALL = { top: 100, bottom: 420, height: 320 };

  it("moves nothing when the field, its label and its line are all in view", () => {
    const { body, form } = build("fat");
    body.getBoundingClientRect = () => TALL as DOMRect;
    body.scrollTop = 30;
    revealRefused(form);
    expect(body.scrollTop).toBe(30);
  });

  it("still scrolls when the field is in view and its line is not", () => {
    const { body, form } = build("fat");
    // A body 280 px tall from 100: Fat and its label are in view, the line (260 to 300 in the content) is not.
    body.getBoundingClientRect = () => ({ top: 100, bottom: 380, height: 280 }) as DOMRect;
    expect(onScreen("fat")[1]).toBeLessThanOrEqual(380);
    revealRefused(form);
    expect(body.scrollTop).toBe(20);
    const [, lineBottom] = onScreen("line");
    expect(lineBottom).toBeLessThanOrEqual(380);
  });
});

describe("revealRefused, the last field's line at the body's end", () => {
  // The body keeps 16 px of padding under its content, and the last block
  // takes 12 of it back, so the content ends 4 px under the shared line
  // (300 in the content). Scrolled to its end, the line keeps those 4 px
  // above the footer's rule.
  function atEnd(): { body: HTMLElement; form: HTMLFormElement } {
    const built = build("fat");
    built.body.style.paddingBottom = "16px";
    Object.defineProperty(built.body, "scrollHeight", { configurable: true, value: 304 });
    Object.defineProperty(built.body, "clientHeight", { configurable: true, value: VIEW.bottom - VIEW.top });
    return built;
  }

  it("scrolls on to the body's end when only the body's own room is left under the line", () => {
    const { body, form } = atEnd();
    revealRefused(form);
    expect(body.scrollTop).toBe(304 - 160);
    expect(VIEW.bottom - onScreen("line")[1]).toBe(4);
    expect(inView(onScreen("fat-label"))).toBe(true);
  });

  it("stops at the line when more than the body's own room is left under it", () => {
    const { body, form } = atEnd();
    Object.defineProperty(body, "scrollHeight", { configurable: true, value: 340 });
    revealRefused(form);
    expect(body.scrollTop).toBe(140);
  });
});

// A page's refusal, right above its submit button, with a phone keyboard up:
// the visible viewport is 308 pixels tall (320 by 568 less 260). jsdom has no
// layout, so each box is given as a browser reports it: everything moves up
// by the page's scrollTop.
describe("revealPageRefusal", () => {
  const pageEl = (): HTMLElement => (document.scrollingElement ?? document.documentElement) as HTMLElement;
  const PAGE: Record<string, [number, number]> = { email: [195, 243], line: [385, 405], button: [413, 461] };
  function buildPage(inSheet = false): HTMLElement {
    const form = `
      <form>
        <input data-el="email" />
        <p role="alert" data-el="line">Invalid email or password.</p>
        <button type="submit" data-el="button">Sign in</button>
      </form>`;
    document.body.innerHTML = inSheet ? `<div data-sheet-body>${form}</div>` : form;
    const page = pageEl();
    page.scrollTop = 0;
    for (const el of document.querySelectorAll<HTMLElement>("[data-el]")) {
      const [top, bottom] = PAGE[el.dataset.el!];
      el.getBoundingClientRect = () => ({ top: top - page.scrollTop, bottom: bottom - page.scrollTop }) as DOMRect;
    }
    return document.querySelector<HTMLElement>('[data-el="line"]')!;
  }
  const viewport = (height: number, offsetTop = 0) =>
    Object.defineProperty(window, "visualViewport", { configurable: true, value: { height, offsetTop } });
  afterEach(() => Object.defineProperty(window, "visualViewport", { configurable: true, value: undefined }));

  it("scrolls the page as little as it must to show the refusal and the button above the keyboard", () => {
    const line = buildPage();
    viewport(308);
    revealPageRefusal(line);
    const page = pageEl();
    // The button's bottom lands on the keyboard's top edge, the refusal above it.
    expect(page.scrollTop).toBe(461 - 308);
    expect(line.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
  });

  it("moves nothing when both are in view", () => {
    const line = buildPage();
    viewport(584);
    revealPageRefusal(line);
    expect(pageEl().scrollTop).toBe(0);
  });

  it("leaves a sheet's refusal alone: the sheet keeps it in sight", () => {
    const line = buildPage(true);
    viewport(308);
    revealPageRefusal(line);
    expect(pageEl().scrollTop).toBe(0);
  });

  // On iOS, and on Android with the default interactive widget, the keyboard
  // leaves the layout viewport alone: the visual viewport shrinks and pans
  // down, so the part the user sees starts at its offsetTop. Boxes are still
  // measured against the layout viewport.
  it("scrolls to the visible part of a panned visual viewport, not to the layout viewport's top", () => {
    const line = buildPage();
    // Visible: 120 to 428 in layout coordinates. The button (413..461) ends 33 under it.
    viewport(308, 120);
    revealPageRefusal(line);
    expect(pageEl().scrollTop).toBe(461 - 428);
    const top = line.getBoundingClientRect().top;
    expect(top).toBeGreaterThanOrEqual(120);
  });

  it("moves nothing when both are in the visible part of a panned visual viewport", () => {
    const line = buildPage();
    // Visible: 160 to 468, which holds the refusal and the button.
    viewport(308, 160);
    revealPageRefusal(line);
    expect(pageEl().scrollTop).toBe(0);
  });
});
