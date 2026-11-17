import { render, screen } from "@testing-library/react";
import { QueryProvider } from "../QueryProvider";

jest.mock("@tanstack/react-query-devtools", () => ({
  ReactQueryDevtools: () => <div data-testid="query-devtools" />,
}));
jest.mock("@/hooks/useIsMobile", () => ({ useIsMobile: jest.fn() }));

import { useIsMobile } from "@/hooks/useIsMobile";

const env = process.env as Record<string, string | undefined>;
const nodeEnv = env.NODE_ENV;

function renderIn(mode: string, mobile: boolean): void {
  env.NODE_ENV = mode;
  jest.mocked(useIsMobile).mockReturnValue(mobile);
  render(
    <QueryProvider>
      <p>content</p>
    </QueryProvider>,
  );
}

describe("QueryProvider", () => {
  afterEach(() => {
    env.NODE_ENV = nodeEnv;
  });

  it("renders its children", () => {
    renderIn("development", false);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("shows the query devtools in development from the md breakpoint", () => {
    renderIn("development", false);
    expect(screen.getByTestId("query-devtools")).toBeInTheDocument();
  });

  it("keeps the query devtools off a phone, so nothing covers the tab bar", () => {
    renderIn("development", true);
    expect(screen.queryByTestId("query-devtools")).not.toBeInTheDocument();
  });

  it("never shows the query devtools outside development", () => {
    renderIn("production", false);
    expect(screen.queryByTestId("query-devtools")).not.toBeInTheDocument();
  });
});
