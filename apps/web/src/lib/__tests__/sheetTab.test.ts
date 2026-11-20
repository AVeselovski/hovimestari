import { sheetTabTarget, tabStops } from "../sheetTab";

function popupWith(html: string): HTMLElement {
  document.body.innerHTML = `<button id="page">page</button><div id="popup" tabindex="-1">${html}</div><div data-toast-region="" tabindex="-1"><button id="undo">Undo</button></div>`;
  return document.getElementById("popup") as HTMLElement;
}

const ids = (els: HTMLElement[]): string[] => els.map((el) => el.id);
const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

describe("tabStops", () => {
  it("keeps what Tab stops on, in document order", () => {
    const popup = popupWith(`
      <button id="a">a</button>
      <button id="disabled" disabled>x</button>
      <button id="minus" tabindex="-1">x</button>
      <input id="hiddenInput" type="hidden" />
      <div hidden><button id="inHidden">x</button></div>
      <div style="display: none"><button id="inNone">x</button></div>
      <div inert><button id="inInert">x</button></div>
      <span data-base-ui-focus-guard="" tabindex="0" id="guard"></span>
      <a id="noHref">x</a>
      <a id="link" href="#x">x</a>
      <div id="zero" tabindex="0">x</div>
      <textarea id="text"></textarea>
    `);
    expect(ids(tabStops(popup))).toEqual(["a", "link", "zero", "text"]);
  });

  it("stops on one radio per named group: the checked one, else the first", () => {
    const popup = popupWith(`
      <input type="radio" name="g" id="g1" /><input type="radio" name="g" id="g2" checked />
      <input type="radio" name="h" id="h1" /><input type="radio" name="h" id="h2" />
    `);
    expect(ids(tabStops(popup))).toEqual(["g2", "h1"]);
  });

  it("stops on the first enabled radio of a group whose first radio is disabled", () => {
    const popup = popupWith(`
      <input type="radio" name="g" id="g1" disabled /><input type="radio" name="g" id="g2" /><input type="radio" name="g" id="g3" />
      <button id="after">after</button>
    `);
    expect(ids(tabStops(popup))).toEqual(["g2", "after"]);
  });

  it("asks the browser whether an element is shown where it can say", () => {
    // A closed <details> hides its content without display: none on any
    // ancestor, so only the browser's checkVisibility sees it. jsdom has none.
    const popup = popupWith(`<details><summary id="summary">more</summary><button id="inClosed">x</button></details>`);
    const hiddenByBrowser = byId("inClosed");
    Object.defineProperty(hiddenByBrowser, "checkVisibility", { value: () => false });
    Object.defineProperty(byId("summary"), "checkVisibility", { value: () => true });
    expect(ids(tabStops(popup))).toEqual(["summary"]);
  });
});

describe("sheetTabTarget", () => {
  const html = `<p id="note" tabindex="-1">note</p><button id="first">1</button><button id="mid">2</button><button id="last">3</button>`;

  it("wraps at the two ends and leaves the moves between them to the browser", () => {
    const popup = popupWith(html);
    expect(sheetTabTarget(popup, byId("last"), false)).toBe(byId("first"));
    expect(sheetTabTarget(popup, byId("first"), true)).toBe(byId("last"));
    expect(sheetTabTarget(popup, byId("mid"), false)).toBeNull();
    expect(sheetTabTarget(popup, byId("mid"), true)).toBeNull();
    expect(sheetTabTarget(popup, byId("first"), false)).toBeNull();
  });

  it("from the popup itself or a focusable before the first stop, Shift+Tab goes to the last", () => {
    const popup = popupWith(html);
    expect(sheetTabTarget(popup, popup, true)).toBe(byId("last"));
    expect(sheetTabTarget(popup, byId("note"), true)).toBe(byId("last"));
    expect(sheetTabTarget(popup, byId("note"), false)).toBeNull();
  });

  it("from outside the popup, Tab goes to the first stop and Shift+Tab to the last", () => {
    const popup = popupWith(html);
    expect(sheetTabTarget(popup, byId("page"), false)).toBe(byId("first"));
    expect(sheetTabTarget(popup, document.body, true)).toBe(byId("last"));
    expect(sheetTabTarget(popup, null, false)).toBe(byId("first"));
  });

  it("leaves focus in the toast region to the toast", () => {
    const popup = popupWith(html);
    expect(sheetTabTarget(popup, byId("undo"), false)).toBeNull();
    expect(sheetTabTarget(popup, byId("undo"), true)).toBeNull();
  });

  it.each(["date", "time", "datetime-local", "month", "week"])(
    "leaves Tab to a %s field at either end, whose own segments take it",
    (type) => {
      const popup = popupWith(
        `<input id="from" type="${type}" /><button id="mid">2</button><input id="to" type="${type}" />`,
      );
      expect(sheetTabTarget(popup, byId("from"), true)).toBeNull();
      expect(sheetTabTarget(popup, byId("to"), false)).toBeNull();
      expect(sheetTabTarget(popup, byId("from"), false)).toBeNull();
      expect(sheetTabTarget(popup, byId("to"), true)).toBeNull();
    },
  );

  it("still wraps from an end that is a plain field", () => {
    const popup = popupWith(`<input id="text" type="text" /><input id="number" type="number" />`);
    expect(sheetTabTarget(popup, byId("text"), true)).toBe(byId("number"));
    expect(sheetTabTarget(popup, byId("number"), false)).toBe(byId("text"));
  });

  it("with no stop at all, sends focus from outside to the popup and leaves a Tab inside to Base UI", () => {
    const popup = popupWith(`<p>nothing to press</p>`);
    expect(sheetTabTarget(popup, byId("page"), false)).toBe(popup);
    expect(sheetTabTarget(popup, popup, false)).toBeNull();
  });
});
