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

  it("pads the page by the gutter variables, which keep clear of the side insets, and puts the caller's classes on the content", () => {
    const { content, outer } = column("space-y-6");
    expect(classes(outer)).toEqual(expect.arrayContaining(["pl-(--page-pad-left)", "pr-(--page-pad-right)"]));
    expect(content).toHaveClass("space-y-6");
    expect(outer).not.toHaveClass("space-y-6");
  });

  it("widens from lg only when asked, and keeps a toast's room at the end only when asked", () => {
    render(
      <PageContainer wide clearToast="full" untitled>
        <p>Wide</p>
      </PageContainer>,
    );
    const shared = screen.getByText("Wide").parentElement!.parentElement!;
    expect(classes(shared)).toEqual(expect.arrayContaining(["md:max-w-page", "lg:max-w-page-wide"]));
    expect(classes(shared.parentElement!)).toContain("pb-toast-clearance");
    expect(classes(shared.parentElement!)).not.toContain("pb-12");
    // The untitled page starts flush: its own sticky header keeps the room above it.
    expect(classes(shared.parentElement!)).toContain("pt-0");
    expect(classes(shared.parentElement!).filter((c) => /^(md:)?pt-/.test(c))).toEqual(["pt-0"]);
  });

  it("keeps half a toast's room at the end of a page that asks for half", () => {
    render(
      <PageContainer clearToast="half">
        <p>Half</p>
      </PageContainer>,
    );
    const outer = screen.getByText("Half").parentElement!.parentElement!.parentElement!;
    expect(classes(outer).filter((c) => /^(md:)?pb-/.test(c))).toEqual(["pb-toast-clearance-half"]);
  });
});
