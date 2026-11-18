import { formatGrams, formatMacroGrams } from "@/lib/foodFormat";
import { formatDay } from "@/lib/localDate";
import { TEST_LOCALE, isDefaultLocalePinned, setTestLocale } from "../locale";

// The setup pins the locale every test formats with, so a figure means the
// same thing on a Finnish machine as on CI's English one. Under a process
// whose own locale writes a decimal comma (LC_ALL=fi_FI.UTF-8), these fail
// the moment the pin is gone.

describe("The test locale", () => {
  it("is pinned by the setup on every test file's global", () => {
    expect(isDefaultLocalePinned()).toBe(true);
    expect(TEST_LOCALE).toBe("en-US");
  });

  it("is what formatting with no locale resolves to, whatever the machine's own", () => {
    expect(new Intl.NumberFormat().resolvedOptions().locale).toBe(TEST_LOCALE);
    expect(new Intl.DateTimeFormat().resolvedOptions().locale).toBe(TEST_LOCALE);
    expect((19.8).toLocaleString()).toBe("19.8");
    expect(formatGrams(19.8)).toBe("19.8");
    expect(formatMacroGrams(20)).toBe("20.0");
    expect(formatDay("2026-11-16")).toBe("November 16, 2026");
  });

  it("keeps a locale a caller names", () => {
    expect(formatGrams(19.8, "fi-FI")).toBe("19,8");
    expect((19.8).toLocaleString("de-DE")).toBe("19,8");
  });

  // These two run in this order on purpose: Jest runs the tests of one file
  // one after another, in the order they are declared, and nothing here is
  // `concurrent`. The second test proves that the setup's own `afterEach`
  // puts the pin back. A single test with its own reset would prove only
  // `resetTestLocale`, not that the setup calls it.
  it("follows a locale a test sets, and is back to the pinned one in the next test", () => {
    setTestLocale("fi-FI");
    expect(formatGrams(19.8)).toBe("19,8");
    expect(new Intl.NumberFormat().resolvedOptions().locale).toBe("fi-FI");
  });

  it("is the pinned one again after a test set another", () => {
    expect(formatGrams(19.8)).toBe("19.8");
  });
});
