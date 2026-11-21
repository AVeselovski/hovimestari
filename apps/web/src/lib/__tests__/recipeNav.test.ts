import {
  forgetDayPlace,
  forgetListPlace,
  isPlainPress,
  keepDayPlace,
  keepListPlace,
  markOpenedInApp,
  readDayPlace,
  readListPlace,
  scrollPageTo,
  setFocusAfterDelete,
  takeFocusAfterDelete,
  takeOpenedInApp,
} from "../recipeNav";

// What a navigation between the Recipes tab, the Day tab and a recipe's page
// keeps, and that a place belongs to the history entry it was kept on: an
// entry reached any other way holds none.

let main: HTMLElement;
let scrolledTo: number[];
const start = window.location.pathname + window.location.search;

const asLeft = { query: "o", favourites: true, tags: ["Dinner"], archivedOpen: true, rowId: "row-1" };

beforeEach(() => {
  main = document.createElement("main");
  document.body.append(main);
  scrolledTo = [];
  main.scrollTo = ((options: ScrollToOptions) => scrolledTo.push(options.top ?? 0)) as typeof main.scrollTo;
  // A new history entry with nothing on it, as a page reached by a link is.
  window.history.pushState(null, "", "/recipes");
  takeOpenedInApp();
  takeFocusAfterDelete();
});
afterEach(() => {
  main.remove();
  window.history.replaceState(null, "", start);
});

describe("the place a page keeps for the way back from a recipe", () => {
  it("keeps the list as a row left it on the history entry, beside what the router holds there", () => {
    window.history.replaceState({ __NA: true, tree: ["kept"] }, "");
    main.scrollTop = 640;
    keepListPlace(asLeft);
    expect(readListPlace()).toEqual({ ...asLeft, top: 640 });
    // The router's own state on the entry is still there.
    expect(window.history.state).toMatchObject({ __NA: true, tree: ["kept"] });
  });

  it("finds no place on another history entry, such as the one a press on the tab bar makes", () => {
    keepListPlace(asLeft);
    // Row A, then the tab bar to Day, then the tab bar to Recipes: each a new entry.
    window.history.pushState({ __NA: true }, "", "/");
    expect(readListPlace()).toBeNull();
    window.history.pushState({ __NA: true }, "", "/recipes");
    expect(readListPlace()).toBeNull();
  });

  it("serves one way back: once the list has used its place, the entry holds none", () => {
    window.history.replaceState({ __NA: true }, "");
    keepListPlace(asLeft);
    forgetListPlace();
    expect(readListPlace()).toBeNull();
    expect(window.history.state).toEqual({ __NA: true });
  });

  it("keeps the day's scroll and the entry apart from the list's place", () => {
    main.scrollTop = 224;
    keepDayPlace("entry-1");
    expect(readDayPlace()).toEqual({ entryId: "entry-1", top: 224 });
    expect(readListPlace()).toBeNull();
    forgetDayPlace();
    expect(readDayPlace()).toBeNull();
  });

  it("reads nothing from a history entry with no state, or with a place that is not one", () => {
    expect(readListPlace()).toBeNull();
    expect(readDayPlace()).toBeNull();
    window.history.replaceState({ hoviRecipeList: "row-1", hoviDay: { entryId: 4, top: "0" } }, "");
    expect(readListPlace()).toBeNull();
    expect(readDayPlace()).toBeNull();
    // What is missing from a place reads as a list with nothing chosen.
    window.history.replaceState({ hoviRecipeList: { rowId: "row-1", top: 12, tags: ["a", 3] } }, "");
    expect(readListPlace()).toEqual({
      query: "",
      favourites: false,
      tags: ["a"],
      archivedOpen: false,
      top: 12,
      rowId: "row-1",
    });
  });

  it("scrolls the page's one scroller", () => {
    scrollPageTo(640);
    expect(scrolledTo).toEqual([640]);
  });
});

describe("the way between the Recipes tab and a recipe's page", () => {
  it("says once that a recipe was opened from inside the app", () => {
    expect(takeOpenedInApp()).toBe(false);
    markOpenedInApp();
    expect(takeOpenedInApp()).toBe(true);
    expect(takeOpenedInApp()).toBe(false);
  });

  it("names the row a delete asked focus for, once", () => {
    setFocusAfterDelete("new");
    expect(takeFocusAfterDelete()).toBe("new");
    expect(takeFocusAfterDelete()).toBeNull();
  });

  it("counts a press as opening here only with the main button and no modifier key", () => {
    const press = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(isPlainPress(press)).toBe(true);
    expect(isPlainPress({ ...press, button: 1 })).toBe(false);
    for (const key of ["metaKey", "ctrlKey", "shiftKey", "altKey"] as const) {
      expect(isPlainPress({ ...press, [key]: true })).toBe(false);
    }
  });
});
