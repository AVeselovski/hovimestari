import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";
import type { ComponentType, ReactElement, ReactNode } from "react";

// Runs before every test file, in jsdom and in the node environment the
// route handler suites ask for. The browser stubs below apply to jsdom only.

// `findBy*` and `waitFor` give up after one second by default, which a slow
// CI runner can exceed on a page's first render. A query that resolves early
// still resolves at once.
configure({ asyncUtilTimeout: 5000 });

// Base UI waits for a popup's CSS animations before unmounting it. jsdom has
// no `getAnimations`, so the wait is skipped anyway. The flag makes that a
// stated choice rather than an accident of what jsdom lacks.
(globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true;

// jsdom's `crypto` has no `randomUUID`, which every supported browser has.
if (typeof globalThis.crypto?.randomUUID !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: randomUUID, configurable: true });
}

if (typeof window !== "undefined") {
  // jsdom has no ResizeObserver.
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserverStub {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    } as unknown as typeof ResizeObserver;
  }

  // jsdom has no scrollIntoView.
  if (typeof Element.prototype.scrollIntoView === "undefined") {
    Element.prototype.scrollIntoView = function scrollIntoViewStub() {};
  }

  // jsdom has no matchMedia at all. Anything that reads a media query on
  // mount would throw without this. It matches nothing (a wide screen, the
  // light scheme). A test that drives a query assigns its own stub.
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = function matchMediaStub(query: string): MediaQueryList {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as MediaQueryList;
    };
  }
}

// ---------------------------------------------------------------------------
// The message catalog in every render. `useTranslations` throws outside
// `NextIntlClientProvider`, so RTL's `render` and `renderHook` are wrapped in
// the provider, fed the real `messages/en.json`, never a stub: a stubbed
// catalog would pass whatever the catalog says. Each render also gets its own
// query client. A caller's own `wrapper` nests inside both.
// ---------------------------------------------------------------------------
jest.mock("@testing-library/react", () => {
  const actual: typeof import("@testing-library/react") = jest.requireActual("@testing-library/react");
  /* eslint-disable @typescript-eslint/no-require-imports -- required inside the factory so jest's hoisting leaves this file's imports alone. */
  const React: typeof import("react") = require("react");
  const { NextIntlClientProvider }: typeof import("next-intl") = require("next-intl");
  const messages: typeof import("../../messages/en.json").default = require("../../messages/en.json");
  const { QueryClientProvider }: typeof import("@tanstack/react-query") = require("@tanstack/react-query");
  const {
    createTestQueryClient,
    registerTestQueryClient,
  }: typeof import("./helpers/queryClient") = require("./helpers/queryClient");
  /* eslint-enable @typescript-eslint/no-require-imports */

  type Wrapper = ComponentType<{ children?: ReactNode }>;

  function composeWrapper(CallerWrapper: Wrapper | undefined): Wrapper {
    const client = registerTestQueryClient(createTestQueryClient());
    return function Composed({ children }: { children?: ReactNode }) {
      const inner = CallerWrapper ? React.createElement(CallerWrapper, { children }) : children;
      return React.createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        children: React.createElement(QueryClientProvider, { client, children: inner }),
      });
    };
  }

  return {
    ...actual,
    render(ui: ReactElement, options: Record<string, unknown> = {}) {
      return actual.render(ui, { ...options, wrapper: composeWrapper(options.wrapper as Wrapper | undefined) });
    },
    renderHook<Result, Props>(callback: (props: Props) => Result, options: Record<string, unknown> = {}) {
      return actual.renderHook(callback, {
        ...options,
        wrapper: composeWrapper(options.wrapper as Wrapper | undefined),
      });
    },
  };
});

afterEach(() => {
  /* eslint-disable-next-line @typescript-eslint/no-require-imports -- the instance the factory above registered clients with. */
  const { clearTestQueryClients }: typeof import("./helpers/queryClient") = require("./helpers/queryClient");
  clearTestQueryClients();
});
