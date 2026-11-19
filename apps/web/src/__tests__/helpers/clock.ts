/** The real clock, taken as this module loads, before any test replaces `Date.now`, so a second `clockFrom` does not read the first. */
const realNow = Date.now.bind(Date);

/**
 * The device's clock reads from `iso` on, and keeps running, so timers and
 * waits behave. Restore it with `jest.restoreAllMocks()`.
 */
export function clockFrom(iso: string): void {
  const start = realNow();
  jest.spyOn(Date, "now").mockImplementation(() => Date.parse(iso) + (realNow() - start));
}
