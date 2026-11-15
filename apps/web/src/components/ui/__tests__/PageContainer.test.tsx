import { render, screen } from "@testing-library/react";
import { PageContainer } from "../PageContainer";

const classes = (el: HTMLElement): string[] => el.className.split(/\s+/);

function column(
  width: "page" | "narrow",
  className?: string,
): { content: HTMLElement; shared: HTMLElement; outer: HTMLElement } {
  render(
    <PageContainer width={width} className={className}>
      <p>Content</p>
    </PageContainer>,
  );
  const content = screen.getByText("Content").parentElement!;
  return { content, shared: content.parentElement!, outer: content.parentElement!.parentElement! };
}

describe("PageContainer", () => {
  it.each(["page", "narrow"] as const)(
    "puts the %s width in the one centred 40rem column every tab shares",
    (width) => {
      const { shared } = column(width);
      expect(classes(shared)).toEqual(expect.arrayContaining(["mx-auto", "md:max-w-page"]));
    },
  );

  it("caps Settings' content at 36rem, left-aligned in that column, so its title lines up with the others", () => {
    const { content } = column("narrow");
    expect(classes(content)).toContain("md:max-w-page-narrow");
    expect(classes(content)).not.toContain("mx-auto");
  });

  it("leaves the page width's content the full column", () => {
    expect(classes(column("page").content)).not.toContain("md:max-w-page-narrow");
  });

  it("keeps the gutter clear of the side insets, and puts the caller's classes on the content", () => {
    const { content, outer } = column("page", "space-y-6");
    expect(outer.className).toContain("var(--safe-left)");
    expect(outer.className).toContain("var(--safe-right)");
    expect(content).toHaveClass("space-y-6");
    expect(outer).not.toHaveClass("space-y-6");
  });
});
