"use client";

import { Icon } from "@/components/Icon";
import {
  chip,
  chipOff,
  chosenTag,
  chosenTagRemove,
  fieldErrorClass,
  fieldHintClass,
  inputClass,
  labelClass,
  lineRoom,
  sheetChipRowWrapping,
} from "@/components/ui/styles";
import { MAX_RECIPE_TAGS, MAX_TAG_LENGTH } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactElement } from "react";
import { sameTag } from "./tags";

// ---------------------------------------------------------------------------
// TagField: a recipe's tags, the person's own words. Text typed, then Enter
// or a comma, makes a tag. Each tag shows as a chip with a cross that takes
// it off. Under the field, the person's other tags, from their other
// recipes, show as chips to tap. A tag is kept once, compared as the server
// compares a recipe's tags, by lower case (`sameTag`), and the first
// spelling stays. At most 10. The field's line holds the hint, or the refusal in its place.
//
// - With 10 tags the field takes no more: it dims, says so to assistive
//   technology, and its line reads "A recipe can have up to 10 tags.". It
//   stays focusable, so focus has somewhere to be.
// - A tag taken off, and one of the other tags tapped, both leave the page
//   under the finger, so focus goes to the field.
// ---------------------------------------------------------------------------

export interface TagFieldProps {
  id: string;
  tags: readonly string[];
  onChange: (tags: string[]) => void;
  /** The person's tags on their other recipes, in order. */
  others: readonly string[];
  /** A refusal of the save, in place of the hint. */
  error: string | null;
}

/** `tags` with `tag` added at the end, unless it is empty, too long, there already or past the limit. */
export function withTag(tags: readonly string[], tag: string): string[] {
  const clean = tag.trim();
  if (clean === "" || clean.length > MAX_TAG_LENGTH || tags.length >= MAX_RECIPE_TAGS) return [...tags];
  if (tags.some((t) => sameTag(t, clean))) return [...tags];
  return [...tags, clean];
}

export function TagField({ id, tags, onChange, others, error }: TagFieldProps): ReactElement {
  const t = useTranslations("recipes.editor");
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lineId = `${id}-line`;
  const full = tags.length >= MAX_RECIPE_TAGS;
  const offered = others.filter((o) => !tags.some((tag) => sameTag(tag, o)));

  function commit(raw: string): void {
    onChange(withTag(tags, raw));
    setText("");
  }

  /** A chip pressed is about to leave: the change, then focus in the field. */
  function fromChip(next: string[]): void {
    onChange(next);
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <div data-tag-field="">
      <label htmlFor={id} className={labelClass}>
        {t("tags")}
      </label>
      {tags.length > 0 && (
        <ul aria-label={t("tags")} className="mb-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag} className="flex max-w-full">
              <span className={chosenTag}>
                <span className="truncate">{tag}</span>
                <button
                  type="button"
                  aria-label={t("tagRemove", { tag })}
                  onClick={() => fromChip(tags.filter((x) => x !== tag))}
                  className={chosenTagRemove}
                >
                  <Icon name="close" className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        id={id}
        type="text"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={MAX_TAG_LENGTH + 1}
        value={text}
        readOnly={full}
        aria-disabled={full || undefined}
        onChange={(e) => {
          const value = e.target.value;
          if (value.includes(",")) {
            const parts = value.split(",");
            let next = [...tags];
            for (const part of parts.slice(0, -1)) next = withTag(next, part);
            onChange(next);
            setText(parts[parts.length - 1]);
          } else setText(value);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
          e.preventDefault();
          commit(text);
        }}
        onBlur={() => {
          if (text.trim() !== "") commit(text);
        }}
        aria-invalid={error !== null || undefined}
        aria-describedby={lineId}
        className={`${inputClass} aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
      />
      <p id={lineId} className={`${error ? fieldErrorClass : fieldHintClass} ${lineRoom}`}>
        {error ?? (full ? t("tagsFull", { max: MAX_RECIPE_TAGS }) : t("tagHint"))}
      </p>
      {offered.length > 0 && (
        <div role="group" aria-label={t("otherTags")} className={`${sheetChipRowWrapping} mt-1`}>
          {offered.map((tag) => (
            <button
              key={tag}
              type="button"
              aria-disabled={full || undefined}
              onClick={() => {
                if (!full) fromChip(withTag(tags, tag));
              }}
              className={`${chip} ${chipOff} aria-disabled:cursor-not-allowed aria-disabled:opacity-60`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
