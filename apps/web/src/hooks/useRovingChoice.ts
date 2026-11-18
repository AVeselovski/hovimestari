import { useRef, type KeyboardEvent } from "react";

// ---------------------------------------------------------------------------
// useRovingChoice: the keyboard half of the app's segmented controls, the
// ones that pick one of a few options (`role="radiogroup"` with
// `role="radio"` buttons) or switch a view (`role="tablist"` with
// `role="tab"` buttons).
//
// The group is one stop in the Tab order: only the chosen option has
// `tabIndex` 0, the rest -1. The arrow keys move the choice and focus
// together, and wrap at either end. Home and End go to the first and last.
// With nothing chosen the first option takes the Tab stop. A disabled option
// is skipped. This is the WAI-ARIA pattern for radio groups and for tabs that
// select on focus.
//
// The look is the caller's (`segmentedTray`, `segmentButton`,
// `segmentActive`, `segmentInactive` in styles.ts). Usage:
//
//   const roving = useRovingChoice(MODES, mode, setMode);
//   <div role="radiogroup" aria-label={label} className={segmentedTray}>
//     {MODES.map((m) => (
//       <button key={m} type="button" role="radio" aria-checked={mode === m}
//         onClick={() => setMode(m)} {...roving.optionProps(m)}>…</button>
//     ))}
//   </div>
// ---------------------------------------------------------------------------

export interface RovingOptionProps {
  tabIndex: 0 | -1;
  ref: (el: HTMLElement | null) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}

export interface RovingChoice<T extends string> {
  /** Spread onto each option's button. */
  optionProps: (option: T) => RovingOptionProps;
}

const NEXT = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS = new Set(["ArrowLeft", "ArrowUp"]);

export function useRovingChoice<T extends string>(
  options: readonly T[],
  value: T | null,
  onChange: (next: T) => void,
  isDisabled: (option: T) => boolean = () => false,
): RovingChoice<T> {
  const elements = useRef(new Map<T, HTMLElement>());
  const enabled = options.filter((o) => !isDisabled(o));
  const tabStop = value !== null && enabled.includes(value) ? value : (enabled[0] ?? null);

  function move(from: T, e: KeyboardEvent<HTMLElement>) {
    if (enabled.length === 0) return;
    const at = enabled.indexOf(from);
    let next: T | undefined;
    if (NEXT.has(e.key)) next = enabled[(at + 1) % enabled.length];
    else if (PREVIOUS.has(e.key)) next = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    if (next !== value) onChange(next);
    const el = elements.current.get(next);
    el?.focus();
    // Focus scrolls an option into view only when it is wholly out of view, so
    // a chip the row's edge half cuts would stay cut. Bring it fully in, to the
    // row's scroll padding. "nearest" moves nothing that is already in view,
    // and only a key gets here, so a tap never makes the row jump. The `?.`
    // is for jsdom, which does not implement scrollIntoView.
    el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  return {
    optionProps: (option) => ({
      tabIndex: option === tabStop ? 0 : -1,
      ref: (el) => {
        if (el) elements.current.set(option, el);
        else elements.current.delete(option);
      },
      onKeyDown: (e) => move(option, e),
    }),
  };
}
