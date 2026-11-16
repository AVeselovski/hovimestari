import { render, screen } from "@testing-library/react";
import { PageContainer } from "../PageContainer";

const classes = (el: HTMLElement): string[] => el.className.split(/\s+/);

function column(className?: string): { content: HTMLElement; shared: HTMLElement; outer: HTMLElement } {
  render(
    <PageContainer className={className}>
      <p>Content</p>
    </PageContainer>,
  );
  const content = screen.getByText("Content").parentElement!;
  return { content, shared: content.parentElement!, outer: content.parentElement!.parentElement! };
}

describe("PageContainer", () => {
  it("puts every page in the one centred 40rem column every tab shares, the header's", () => {
    const { shared } = column();
    expect(classes(shared)).toEqual(expect.arrayContaining(["mx-auto", "md:max-w-page"]));
  });

  it("gives the content the full column, so the header's rule spans exactly the content under it", () => {
    const { content } = column();
    expect(classes(content).filter((c) => c.startsWith("md:max-w"))).toEqual([]);
  });

  it("keeps the gutter clear of the side insets, and puts the caller's classes on the content", () => {
    const { content, outer } = column("space-y-6");
    expect(outer.className).toContain("var(--safe-left)");
    expect(outer.className).toContain("var(--safe-right)");
    expect(content).toHaveClass("space-y-6");
    expect(outer).not.toHaveClass("space-y-6");
  });
});
