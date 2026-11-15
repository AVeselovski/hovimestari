import { render, screen } from "@testing-library/react";
import { PageContainer } from "../PageContainer";

describe("PageContainer", () => {
  it("renders its children", () => {
    render(
      <PageContainer width="default">
        <p>Page content</p>
      </PageContainer>,
    );
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it.each([
    ["narrow", "max-w-page-narrow"],
    ["default", "max-w-page-default"],
    ["wide", "max-w-page-wide"],
  ] as const)("applies the %s width's own max-width class", (width, expectedClass) => {
    render(
      <PageContainer width={width}>
        <p>Content</p>
      </PageContainer>,
    );
    const container = screen.getByText("Content").parentElement;
    expect(container).toHaveClass(expectedClass);
    expect(container).toHaveClass("mx-auto");
  });

  it("never applies more than one width's max-width class at once", () => {
    render(
      <PageContainer width="wide">
        <p>Content</p>
      </PageContainer>,
    );
    const container = screen.getByText("Content").parentElement!;
    expect(container).toHaveClass("max-w-page-wide");
    expect(container).not.toHaveClass("max-w-page-narrow");
    expect(container).not.toHaveClass("max-w-page-default");
  });

  it("merges an additional className onto the container", () => {
    render(
      <PageContainer width="narrow" className="mt-4">
        <p>Content</p>
      </PageContainer>,
    );
    expect(screen.getByText("Content").parentElement).toHaveClass("mt-4");
  });
});
