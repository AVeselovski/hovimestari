// ---------------------------------------------------------------------------
// The locale every test formats with, whatever the machine's own.
//
// The app formats figures and dates in the device's language: the formatters
// in lib/ (foodFormat, entryFormat, targetFormat, localDate) pass no locale,
// so `Intl` uses the runtime's default. In a browser that default is the
// device's language. Under jest it is the process's, which Node takes from
// LC_ALL and LANG once, at start-up, and never reads again. A Finnish machine
// would render "19,8 g" where an English one renders "19.8 g", and the same
// test would mean two things.
//
// So the setup file pins the default here: every `Intl` constructor and every
// `toLocale*` method that is given no locale gets the pinned one instead,
// exactly as a browser set to that language would. A locale a caller names is
// kept as named. A test that shows a screen in another language sets one with
// `setTestLocale` and the setup puts the pin back after each test.
//
// The state lives on the global, not in this module, so a test that resets
// its module registry still sees the one pin the setup installed.
// ---------------------------------------------------------------------------

/** The locale a test formats with unless it sets another. What CI's English machine has. */
export const TEST_LOCALE = "en-US";

const STATE = Symbol.for("hovimestari.testLocale");

interface PinState {
  locale: string;
}

type WithPin = typeof globalThis & { [STATE]?: PinState };

function state(): PinState | undefined {
  return (globalThis as WithPin)[STATE];
}

/** The locale formatting with no locale resolves to now. */
function current(): string {
  return state()?.locale ?? TEST_LOCALE;
}

/** `locales` as given, or the pinned locale when it names none. */
function orPinned(locales: unknown): unknown {
  if (locales === undefined) return current();
  if (Array.isArray(locales) && locales.length === 0) return current();
  return locales;
}

type AnyFunction = (...args: unknown[]) => unknown;

/** `fn` with its argument at `index` defaulted to the pinned locale. */
function pinArgument<F extends AnyFunction>(fn: F, index: number): F {
  return new Proxy(fn, {
    apply(target, thisArg, args: unknown[]) {
      const next = [...args];
      next[index] = orPinned(args[index]);
      return Reflect.apply(target, thisArg, next);
    },
    construct(target, args: unknown[], newTarget) {
      const next = [...args];
      next[index] = orPinned(args[index]);
      return Reflect.construct(target as unknown as new (...a: unknown[]) => object, next, newTarget);
    },
  });
}

const INTL_CONSTRUCTORS = [
  "Collator",
  "DateTimeFormat",
  "DisplayNames",
  "ListFormat",
  "NumberFormat",
  "PluralRules",
  "RelativeTimeFormat",
  "Segmenter",
] as const;

/** Replace `owner[key]` with its pinned form, when it exists. */
function pin(owner: object, key: string, index: number): void {
  const record = owner as Record<string, unknown>;
  const original = record[key];
  if (typeof original !== "function") return;
  Object.defineProperty(owner, key, {
    value: pinArgument(original as AnyFunction, index),
    writable: true,
    configurable: true,
  });
}

/** Install the pin on this test file's global. Idempotent. */
export function pinDefaultLocale(): void {
  if (state()) return;
  (globalThis as WithPin)[STATE] = { locale: TEST_LOCALE };
  for (const name of INTL_CONSTRUCTORS) pin(Intl, name, 0);
  pin(Number.prototype, "toLocaleString", 0);
  pin(BigInt.prototype, "toLocaleString", 0);
  pin(Date.prototype, "toLocaleString", 0);
  pin(Date.prototype, "toLocaleDateString", 0);
  pin(Date.prototype, "toLocaleTimeString", 0);
  pin(String.prototype, "localeCompare", 1);
}

/** Whether the pin is installed on this global. */
export function isDefaultLocalePinned(): boolean {
  return state() !== undefined;
}

/** Format as a device set to `locale` would, until the test ends. */
export function setTestLocale(locale: string): void {
  const pinned = state();
  if (!pinned) throw new Error("The test locale is not pinned. src/__tests__/setup.ts pins it.");
  pinned.locale = locale;
}

/** Back to `TEST_LOCALE`. The setup calls it after every test. */
export function resetTestLocale(): void {
  const pinned = state();
  if (pinned) pinned.locale = TEST_LOCALE;
}
