"use client";

import { StableLabel } from "@/components/ui/StableLabel";
import { btnSecondary, fieldHintClass } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactElement } from "react";

/** How long the button reads "Copied" after a copy. */
export const COPIED_FEEDBACK_MS = 2000;

interface CopyButtonProps {
  /** Exactly what lands on the clipboard. */
  text: string;
  /** The button's name for a screen reader, saying what it copies: "Copy the key". It reads "Copy" on screen. */
  label: string;
  /** The id of the line that says what this copies, since every copy button reads "Copy". */
  describedBy?: string;
  /** The clipboard refused, or the browser has none. The caller says how to copy by hand. */
  onFailed: () => void;
  /** A copy went through, after an earlier one failed too. */
  onCopied?: () => void;
  /** Take focus on mount: the first thing to do in the step that shows it. */
  autoFocus?: boolean;
  className?: string;
}

/**
 * Selects everything in `el` and focuses it, so a person whose browser
 * refused the clipboard can copy it by hand with one gesture. `el` must be
 * focusable (`tabIndex`).
 */
export function selectAllIn(el: HTMLElement | null): void {
  if (!el) return;
  el.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * The line that says how to copy by hand after the clipboard was refused. A
 * polite live region that is always there, so the line is announced when it
 * comes, and holds no room while it is empty.
 */
export function CopyFallbackLine({ shown, text }: { shown: boolean; text: string }): ReactElement {
  return (
    <div role="status" aria-live="polite">
      {shown && <p className={fieldHintClass}>{text}</p>}
    </div>
  );
}

/**
 * Copies `text` and reads "Copied" for two seconds. In the ink, as every
 * button label is: Hovimestari keeps its hues for the figures. Both labels
 * share one grid cell, so the button keeps its width and nothing beside it
 * moves. A live region says "Copied" to a screen reader.
 */
export function CopyButton({
  text,
  label,
  describedBy,
  onFailed,
  onCopied,
  autoFocus,
  className = "",
}: CopyButtonProps): ReactElement {
  const t = useTranslations("settings.connectedAi");
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  async function handleCopy(): Promise<void> {
    try {
      // Missing outside a secure context, and in some embedded browsers.
      if (!navigator.clipboard) throw new Error("No clipboard");
      await navigator.clipboard.writeText(text);
    } catch {
      setCopied(false);
      onFailed();
      return;
    }
    setCopied(true);
    onCopied?.();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={label}
        aria-describedby={describedBy}
        autoFocus={autoFocus}
        className={`${btnSecondary} shrink-0 ${className}`}
      >
        <StableLabel active={copied} idle={t("copy")} busy={t("copied")} />
      </button>
      {/* The label change is not announced on its own. */}
      <span role="status" className="sr-only">
        {copied ? t("copied") : ""}
      </span>
    </>
  );
}
