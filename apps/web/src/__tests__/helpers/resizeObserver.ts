// A ResizeObserver a test can drive: `resize(el)` delivers an entry for
// `el` to every observer watching it, as the browser does after layout.
// jsdom has no layout, so the test sets the sizes the hook reads first.

type Callback = (entries: { target: Element }[]) => void;

const observers = new Set<{ callback: Callback; targets: Set<Element> }>();

export function installResizeObserver(): () => void {
  const original = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    private record: { callback: Callback; targets: Set<Element> };
    constructor(callback: Callback) {
      this.record = { callback, targets: new Set() };
      observers.add(this.record);
    }
    observe(el: Element) {
      this.record.targets.add(el);
    }
    unobserve(el: Element) {
      this.record.targets.delete(el);
    }
    disconnect() {
      observers.delete(this.record);
    }
  } as unknown as typeof ResizeObserver;
  return () => {
    observers.clear();
    globalThis.ResizeObserver = original;
  };
}

export function resize(...targets: Element[]): void {
  for (const record of [...observers]) {
    const entries = targets.filter((t) => record.targets.has(t)).map((target) => ({ target }));
    if (entries.length > 0) record.callback(entries);
  }
}

/** Gives `el` fixed layout numbers, as jsdom reports none. */
export function setLayout(el: HTMLElement, layout: Record<string, number>): void {
  for (const [key, value] of Object.entries(layout)) {
    Object.defineProperty(el, key, { configurable: true, get: () => value });
  }
}
