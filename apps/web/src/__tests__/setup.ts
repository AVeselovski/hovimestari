import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";
import type { ComponentType, ReactElement, ReactNode } from "react";

// `findBy*` and `waitFor` give up after one second by default. On a CI runner
// that runs the suite under coverage, a page's first render after module load
// can take longer than that, and `page.periodCoherence.test.tsx` and
// `BalanceAlert.test.tsx` have each failed that way on branches that never
// touched apps/web. The wait is only a ceiling: a query that resolves early
// still resolves at the same moment, so passing tests run no slower.
configure({ asyncUtilTimeout: 5000 });

// Base UI waits for a popup's CSS animations to finish before unmounting it
// (`useAnimationsFinished`). jsdom has no `getAnimations`, so the wait is
// already skipped here; the flag says so on purpose, so that unmount timing in
// tests is a stated choice rather than an accident of what jsdom lacks.
(globalThis as { BASE_UI_ANIMATIONS_DISABLED?: boolean }).BASE_UI_ANIMATIONS_DISABLED = true;

// jsdom doesn't implement ResizeObserver; provide a minimal no-op stub
// so components that observe element size (e.g. ScrollFadeList) can mount.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// jsdom's `crypto` has `getRandomValues` but no `randomUUID`, which every
// browser the app supports has. The paperwork prompt and the entry form make
// an upload's request key with it. Node's own is the same function.
if (typeof globalThis.crypto.randomUUID !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomUUID } = require("node:crypto") as typeof import("node:crypto");
  Object.defineProperty(globalThis.crypto, "randomUUID", { value: randomUUID, configurable: true });
}

// jsdom doesn't implement scrollIntoView either; components that scroll a
// freshly-appeared element into view (e.g. `spending/page.tsx`'s section jump) need it
// to be a no-op rather than throw.
if (typeof Element.prototype.scrollIntoView === "undefined") {
  Element.prototype.scrollIntoView = function scrollIntoViewStub() {};
}

// jsdom has no `matchMedia` at all — `window.matchMedia` is `undefined`, not
// a stub that merely misbehaves. `useMediaQuery`/`useIsMobile` (and anything
// that opens through them, e.g. `PeriodRangeEditor` choosing between a
// popover and a `BottomSheet`) call it inside an effect on every mount, so
// without a default any test that renders such a component — not just the
// tests that exercise the media query itself — throws the moment it mounts.
// Defaults to "no match" (desktop). Tests that need to drive the live value
// (`useIsMobile.test.tsx` and its siblings) already assign their own
// `window.matchMedia` stub per test, which simply overrides this default —
// no conflict, since this only runs once per test FILE, before those tests'
// own per-`it` assignments.
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

// jsdom's CSSOM (cssstyle 2.x) silently REJECTS `background-color: var(...)`.
// `backgroundColor.js`'s setter runs the value through `parsers.parseColor`,
// which has no notion of `var()`; when that returns undefined the setter
// just returns without storing anything (cssstyle/lib/properties/backgroundColor.js).
// The property is then unset on BOTH the element written with it and any
// comparison value written the same way — `getAttribute("style")`,
// `el.style.getPropertyValue("background-color")` and jest-dom's
// `toHaveStyle({ backgroundColor: ... })` (which parses its own expected
// object through the same CSSOM) all read back empty, regardless of what
// colour was actually asked for. A `toHaveStyle({ backgroundColor: "var(--x)" })`
// assertion is therefore a silent no-op: it passes whether the component sets
// the right token, the wrong token, or nothing at all. See docs/design/ui-overhaul.md
// deviation #56 for the fuller writeup and the correct test idiom.
//
// This patches ONLY `backgroundColor`'s CSS-variable case (a value that is
// literally `var(...)`, never a valid input to the real colour parser) to
// store the raw string via cssstyle's internal `_setProperty`, matching what
// a real browser does. Real colour values (hex/rgb/named) are untouched —
// they already round-trip correctly through the unpatched parser. Scoped to
// `backgroundColor` because that's the property the four affected tests
// actually assert on; other colour properties (`color`, `borderColor`, ...)
// aren't known to have the same test-suite exposure and are left alone
// rather than widening this patch's blast radius speculatively.
const CSS_VAR_COLOUR_PROPS = ["backgroundColor"] as const;
for (const prop of CSS_VAR_COLOUR_PROPS) {
  const proto = window.CSSStyleDeclaration.prototype as unknown as Record<string, PropertyDescriptor | undefined>;
  const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
  if (!descriptor?.get || !descriptor.set) continue;
  const cssPropertyName = prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  Object.defineProperty(proto, prop, {
    configurable: true,
    enumerable: descriptor.enumerable,
    get: descriptor.get,
    set(this: CSSStyleDeclaration, value: string) {
      if (typeof value === "string" && value.trim().toLowerCase().startsWith("var(")) {
        (
          this as unknown as { _setProperty: (name: string, value: string, priority: string | null) => void }
        )._setProperty(cssPropertyName, value, null);
        return;
      }
      descriptor.set!.call(this, value);
    },
  });
}

// ---------------------------------------------------------------------------
// next-intl test provider (docs/design/i18n-message-catalog.md, D15).
//
// `useTranslations` throws outside `NextIntlClientProvider`, and the app's
// 150+ existing test files render leaf components directly with the plain
// `render`/`renderHook` from "@testing-library/react" — editing every one of
// them is not acceptable (D15's whole point). Instead this default-wraps
// RTL's `render`/`renderHook` in the provider, fed the REAL
// `messages/en.json` catalog — never a stub. A stubbed/auto-echoing provider
// would be a mock that encodes the bug (CLAUDE.md failure mode 1): green
// whatever the catalog says. Production code still throws loudly if mounted
// outside a real provider, so this wrapper cannot mask a missing provider in
// the app itself.
//
// If a caller already passes its own `wrapper` option (e.g. the
// `renderWithProviders` helper), that wrapper nests INSIDE the intl provider
// so both compose.
//
// This patches "@testing-library/react" itself, never "next-intl" —
// `jest.mock("next-intl", ...)` is prohibited by the design (see D15) in any
// form, since a mocked catalog would be exactly the encoded-bug mock
// CLAUDE.md warns about. `require(...)` is used inside the factory (rather
// than referencing module-scope imports) so babel-plugin-jest-hoist doesn't
// need to reorder anything around this file's own imports.
// ---------------------------------------------------------------------------
jest.mock("@testing-library/react", () => {
  const actual: typeof import("@testing-library/react") = jest.requireActual("@testing-library/react");
  /* eslint-disable @typescript-eslint/no-require-imports -- required (not
     imported) so babel-plugin-jest-hoist doesn't treat these as out-of-scope
     references to this file's own top-level imports; see the comment above. */
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

  function IntlOnly({ children }: { children?: ReactNode }) {
    return React.createElement(NextIntlClientProvider, { locale: "en", messages, children });
  }

  // Every `render`/`renderHook` call gets its own query client, so no test
  // sees another's cache and the 150+ tests that render a leaf component
  // with plain `render` need no edit. A caller wrapper with its own
  // `QueryClientProvider` nests inside this one and wins: that is how a test
  // gets a client it can inspect.
  function composeWrapper(CallerWrapper: Wrapper | undefined): Wrapper {
    const client = registerTestQueryClient(createTestQueryClient());
    return function Composed({ children }: { children?: ReactNode }) {
      const inner = CallerWrapper ? React.createElement(CallerWrapper, { children }) : children;
      return React.createElement(IntlOnly, {
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

// Clears every query client the wrapper above made, so no cache, observer or
// timer outlives its test.
afterEach(() => {
  /* eslint-disable-next-line @typescript-eslint/no-require-imports -- the same
     module instance the mock factory above registered clients with. */
  const { clearTestQueryClients }: typeof import("./helpers/queryClient") = require("./helpers/queryClient");
  clearTestQueryClients();
});
