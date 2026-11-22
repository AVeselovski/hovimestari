"use client";

import { Icon } from "@/components/Icon";
import { focusRing, inputClass } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import { useSyncExternalStore, type ReactElement, type RefObject } from "react";

/** No event says the camera API came or went: it is there for the page's life or never. */
const subscribeNever = (): (() => void) => () => {};

/** The browser can ask for a camera. Only in a secure context, so never on plain http over the LAN. */
function useCameraApi(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => typeof navigator.mediaDevices?.getUserMedia === "function",
    () => false,
  );
}

/** The button in the field's end slot: the cross and the camera share it, so the field never changes width. */
const slotButton = `absolute top-0.5 right-0.5 inline-flex size-11 items-center justify-center rounded-control text-ink-muted hover:text-ink ${focusRing}`;

/**
 * The search field, pinned in the sheet's header: a text field with the
 * search icon and, once something is typed, a 44px button that clears it.
 * Empty, the same slot holds a camera button that opens the scanner
 * (`onScan`), where the browser can ask for a camera.
 * Enter puts the keyboard away, so the results show in full, and runs
 * `onEnter` when the sheet gives one, such as the lookup of a typed barcode. It is the one
 * field in the app with a placeholder, which says what the field searches, never a value
 * to type: "Foods, meals and recipes" under the label "Search foods, meals and recipes",
 * since the magnifier already says search and the shorter words fit a phone 320 px wide.
 * A host that searches something else gives one text for both. A placeholder too long for
 * its field ends in an ellipsis rather than mid-letter. The label a screen reader reads is
 * always whole.
 */
export function SearchField({
  id,
  inputRef,
  value,
  onChange,
  onEnter,
  onScan,
  autoFocus,
  label,
}: {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  /** Opens the scanner, with the camera button as its opener. No camera button without it. */
  onScan?: (opener: HTMLElement) => void;
  autoFocus: boolean;
  /** The label and placeholder, when the field searches something other than foods and meals. */
  label?: string;
}): ReactElement {
  const t = useTranslations("foods.sheet");
  const tScan = useTranslations("foods.scan");
  const cameraApi = useCameraApi();
  const name = label ?? t("searchLabel");
  return (
    <div role="search" className="relative pb-1">
      <label htmlFor={id} className="sr-only">
        {name}
      </label>
      <span className="pointer-events-none absolute top-0 left-3.5 flex h-12 items-center text-ink-muted">
        <Icon name="search" className="size-5" />
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        placeholder={label ?? t("searchPlaceholder")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.currentTarget.blur();
          onEnter?.();
        }}
        autoFocus={autoFocus}
        className={`${inputClass} pr-12 pl-11 text-ellipsis placeholder:text-ellipsis`}
      />
      {value !== "" ? (
        <button
          key="clear"
          type="button"
          aria-label={t("clear")}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className={slotButton}
        >
          <Icon name="close" className="size-5" />
        </button>
      ) : (
        onScan !== undefined &&
        cameraApi && (
          <button
            key="camera"
            type="button"
            aria-label={tScan("title")}
            onClick={(e) => onScan(e.currentTarget)}
            className={slotButton}
          >
            <Icon name="camera" className="size-6" />
          </button>
        )
      )}
    </div>
  );
}
