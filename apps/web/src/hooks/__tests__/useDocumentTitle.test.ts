import { act, renderHook } from "@testing-library/react";
import { useDocumentTitle } from "../useDocumentTitle";

// The framework writes the route's title again after a page has mounted, as
// its metadata arrives (measured in the browser: the name held in 1 run of 8
// without the observer). These tests write the title's text the way the
// framework does, in place, after the hook has run.

/** Lets the observer's microtask run. */
const settle = () => act(async () => {});

describe("useDocumentTitle", () => {
  let title: HTMLTitleElement;
  let text: Text;
  beforeEach(() => {
    title = document.createElement("title");
    title.textContent = "Recipes · Hovimestari";
    document.head.append(title);
    text = title.firstChild as Text;
  });
  afterEach(() => title.remove());

  it("puts the name back when the route's title is written again after the page has shown", async () => {
    renderHook(() => useDocumentTitle("Shakshuka"));
    expect(document.title).toBe("Shakshuka · Hovimestari");
    // The framework's metadata lands late and rewrites the text it rendered.
    text.data = "Recipes · Hovimestari";
    await settle();
    expect(document.title).toBe("Shakshuka · Hovimestari");
    // The same text node all along, so the framework's next title still lands in the document.
    expect(title.firstChild).toBe(text);
  });

  it("gives back the route's latest title when the page leaves, not the one it first found", async () => {
    const { unmount } = renderHook(() => useDocumentTitle("Shakshuka"));
    text.data = "Recipe · Hovimestari";
    await settle();
    expect(document.title).toBe("Shakshuka · Hovimestari");
    unmount();
    expect(document.title).toBe("Recipe · Hovimestari");
    // It no longer watches: the next route's title stays.
    text.data = "Day · Hovimestari";
    await settle();
    expect(document.title).toBe("Day · Hovimestari");
  });

  it("leaves the next route's title alone when that route set it before this page left", () => {
    const { unmount } = renderHook(() => useDocumentTitle("Shakshuka"));
    // The next route's title lands and the page leaves before the observer has run.
    text.data = "Day · Hovimestari";
    unmount();
    expect(document.title).toBe("Day · Hovimestari");
  });

  it("takes the new name when the name changes, and does nothing without a name", async () => {
    const { rerender } = renderHook(({ name }: { name?: string }) => useDocumentTitle(name), {
      initialProps: { name: undefined } as { name?: string },
    });
    expect(document.title).toBe("Recipes · Hovimestari");
    rerender({ name: "Shakshuka" });
    expect(document.title).toBe("Shakshuka · Hovimestari");
    rerender({ name: "Shakshuka for two" });
    expect(document.title).toBe("Shakshuka for two · Hovimestari");
  });
});
