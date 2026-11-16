import { focusAfterRowRemoval, rowOf } from "@/lib/focusAfterRemoval";

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

let host: HTMLElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

const byId = (id: string) => document.getElementById(id) as HTMLElement;

describe("focusAfterRowRemoval", () => {
  it("names the same control in the next row", () => {
    host = mount(`<table><tbody>
      <tr><td><button id="r1">Rename</button><button id="d1">Delete</button></td></tr>
      <tr><td><button id="r2">Rename</button><button id="d2">Delete</button></td></tr>
    </tbody></table>`);
    expect(focusAfterRowRemoval(byId("d1"))).toBe(byId("d2"));
    expect(focusAfterRowRemoval(byId("r1"))).toBe(byId("r2"));
  });

  it("falls back to the row before when the row is the last one", () => {
    host = mount(`<ul><li><button id="d1">Delete</button></li><li><button id="d2">Delete</button></li></ul>`);
    expect(focusAfterRowRemoval(byId("d2"))).toBe(byId("d1"));
  });

  it("names the fallback when the row has no neighbour", () => {
    host = mount(`<input id="search" /><ul><li><button id="d1">Delete</button></li></ul>`);
    expect(focusAfterRowRemoval(byId("d1"), byId("search"))).toBe(byId("search"));
    expect(focusAfterRowRemoval(byId("d1"))).toBeNull();
  });

  it("matches a control by data-row-action when the rows hold different controls", () => {
    host = mount(`<table><tbody>
      <tr><td><input type="checkbox" /><button>Receipt?</button><button id="m1" data-row-action="menu">⋯</button></td></tr>
      <tr><td><input type="checkbox" /><button id="m2" data-row-action="menu">⋯</button></td></tr>
    </tbody></table>`);
    expect(focusAfterRowRemoval(byId("m1"))).toBe(byId("m2"));
  });

  it("skips a disabled control at the same position for the row's first usable one", () => {
    host = mount(`<ul>
      <li><button id="e1">Edit</button><button id="d1">Delete</button></li>
      <li><button id="e2">Edit</button><button id="d2" disabled>Delete</button></li>
    </ul>`);
    expect(focusAfterRowRemoval(byId("d1"))).toBe(byId("e2"));
  });

  it("steps over siblings that are not rows of the same kind", () => {
    host = mount(`<div>
      <div data-row=""><button id="d1">Delete</button></div>
      <form><input /></form>
      <div data-row=""><button id="d2">Delete</button></div>
    </div>`);
    expect(focusAfterRowRemoval(byId("d1"))).toBe(byId("d2"));
  });

  it("takes the nearest row, so a list inside a marked card is its own list", () => {
    host = mount(`<div data-row="">
      <ul><li><button id="c1">⋯</button></li><li><button id="c2">⋯</button></li></ul>
    </div>`);
    expect(rowOf(byId("c1"))?.tagName).toBe("LI");
    expect(focusAfterRowRemoval(byId("c1"))).toBe(byId("c2"));
  });

  it("names the fallback for an opener that has already left the page", () => {
    const gone = document.createElement("button");
    host = mount(`<input id="search" />`);
    expect(focusAfterRowRemoval(gone, byId("search"))).toBe(byId("search"));
  });
});
