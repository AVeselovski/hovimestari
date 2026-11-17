import { revealRefused } from "../revealRefused";

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
