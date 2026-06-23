import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecipeThumb } from "./RecipeThumb.js";

const errorSpy = vi.spyOn(console, "error").mockImplementation((msg, ...rest) => {
  if (typeof msg === "string" && msg.includes("useLayoutEffect")) return;
  console.warn(msg, ...rest);
});
beforeAll(() => errorSpy.mockClear());
afterAll(() => errorSpy.mockRestore());

describe("RecipeThumb", () => {
  it("renders an <img> with the recipeImageUrl when imageId is set", () => {
    const html = renderToStaticMarkup(
      <RecipeThumb imageId="abc-123.jpg" alt="Jauhelihapasta" size="md" />,
    );
    expect(html).toContain("<img");
    expect(html).toContain("/images/abc-123.jpg");
    expect(html).toContain('alt="Jauhelihapasta"');
  });

  it("renders no <img> and no /images/ URL when imageId is absent", () => {
    const html = renderToStaticMarkup(
      <RecipeThumb alt="Jauhelihapasta" size="sm" />,
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("/images/");
  });

  it('sets loading="lazy" on the image element', () => {
    const html = renderToStaticMarkup(
      <RecipeThumb imageId="abc-123.jpg" alt="Jauhelihapasta" size="md" />,
    );
    expect(html).toContain('loading="lazy"');
  });
});
