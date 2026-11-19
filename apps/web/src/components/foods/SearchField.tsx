"use client";

import { Icon } from "@/components/Icon";
import { focusRing, inputClass } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement, RefObject } from "react";

/**
 * The search field, pinned in the sheet's header: a text field with the
 * search icon and, once something is typed, a 44px button that clears it.
 * Enter puts the keyboard away, so the results show in full, and runs
 * `onEnter` when the sheet gives one, such as the lookup of a typed barcode. Its placeholder
 * is its own label, "Search foods and meals", the one field in the app that
 * has one: it says what the field searches, never a value to type.
 */
export function SearchField({
  id,
  inputRef,
  value,
  onChange,
  onEnter,
  autoFocus,
}: {
  id: string;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  autoFocus: boolean;
}): ReactElement {
  const t = useTranslations("foods.sheet");
  return (
    <div role="search" className="relative pb-1">
      <label htmlFor={id} className="sr-only">
        {t("searchLabel")}
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
        placeholder={t("searchLabel")}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.currentTarget.blur();
          onEnter?.();
        }}
        autoFocus={autoFocus}
        className={`${inputClass} pr-12 pl-11`}
      />
      {value !== "" && (
        <button
          type="button"
          aria-label={t("clear")}
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className={`absolute top-0.5 right-0.5 inline-flex size-11 items-center justify-center rounded-control text-ink-muted hover:text-ink ${focusRing}`}
        >
          <Icon name="close" className="size-5" />
        </button>
      )}
    </div>
  );
}
