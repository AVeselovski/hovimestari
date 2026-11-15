import { safeRedirectPath } from "../redirect";

const ORIGIN = "https://hovi.example";

describe("safeRedirectPath", () => {
  it.each([
    ["/", "/"],
    ["/settings", "/settings"],
    ["/recipes?x=1#top", "/recipes?x=1#top"],
    ["/recipes?x=1#y", "/recipes?x=1#y"],
    ["/a//b", "/a//b"],
  ])("keeps the path %s", (target, expected) => {
    expect(safeRedirectPath(target, ORIGIN)).toBe(expected);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/\t\\evil.example",
    "/\n\t/evil.example/path",
    "https://evil.example",
    "javascript:alert(1)",
    "data:text/html,x",
    "#top",
    "settings",
    "",
    null,
    undefined,
  ])("refuses %j", (target) => {
    expect(safeRedirectPath(target, ORIGIN)).toBeNull();
  });

  // The URL parser collapses dot segments, so each of these resolves on the
  // app's own origin to a pathname that begins with `//` or `/\\`. Handed to
  // the router, that string is a protocol-relative URL to another host.
  it.each([
    "/.//evil.com",
    "/a/..//evil.com",
    "/%2e//evil.com",
    "/./\\evil.com",
    "/a/b/../..//evil.example",
    "/a/b/../../\\evil.example",
    "/%2E%2e/.//evil.example",
  ])("refuses the dot-segment form %j", (target) => {
    expect(safeRedirectPath(target, ORIGIN)).toBeNull();
  });

  it("only ever returns a path that resolves to itself on the app's origin", () => {
    const inputs = ["/settings", "/a/../settings", "/recipes?x=1#y", "/a//b", "/.//evil.com", "/%2e//evil.com"];
    for (const input of inputs) {
      const out = safeRedirectPath(input, ORIGIN);
      if (out === null) continue;
      expect(out.startsWith("//") || out.startsWith("/\\")).toBe(false);
      const again = new URL(out, ORIGIN);
      expect(again.origin).toBe(ORIGIN);
      expect(`${again.pathname}${again.search}${again.hash}`).toBe(out);
    }
  });

  it("returns the resolved path, not the raw input", () => {
    expect(safeRedirectPath("/a/../settings", ORIGIN)).toBe("/settings");
  });
});
