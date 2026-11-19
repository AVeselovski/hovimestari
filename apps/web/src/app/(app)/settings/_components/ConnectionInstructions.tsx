"use client";

import {
  codeBox,
  fieldHintClass,
  focusRing,
  segmentActive,
  segmentButton,
  segmentedTray,
  segmentInactive,
} from "@/components/ui/styles";
import { useRovingChoice } from "@/hooks/useRovingChoice";
import { claudeCodeCommand, claudeDesktopConfig, KEY_PLACEHOLDER } from "@/lib/mcpConnection";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactElement } from "react";
import { CopyButton, CopyFallbackLine, selectAllIn } from "./CopyButton";

type Assistant = "claudeCode" | "claudeDesktop";

const ASSISTANTS: readonly Assistant[] = ["claudeCode", "claudeDesktop"];

interface ConnectionInstructionsProps {
  /** The MCP endpoint, from `mcpServerUrl()`. */
  url: string;
  /** The real key, in the reveal right after it was made. Without it the snippets carry `YOUR_KEY`. */
  connectionKey?: string;
  /** The id of the heading that names the block, which labels the choice of assistant. */
  labelledBy: string;
}

/**
 * How to add Hovimestari to Claude Code or Claude Desktop: a choice of two,
 * one step to follow and the text to copy. Shown in the key reveal with the
 * real key, and under the section's "How to connect" with a placeholder.
 * The text wraps inside its own box, so a long command never widens the
 * sheet or the page.
 */
export function ConnectionInstructions({ url, connectionKey, labelledBy }: ConnectionInstructionsProps): ReactElement {
  const t = useTranslations("settings.connectedAi.setup");
  const id = useId();
  const [assistant, setAssistant] = useState<Assistant>("claudeCode");
  const [copyFailed, setCopyFailed] = useState(false);
  const snippetRef = useRef<HTMLPreElement>(null);
  function choose(next: Assistant): void {
    setAssistant(next);
    setCopyFailed(false);
  }
  const roving = useRovingChoice(ASSISTANTS, assistant, choose);

  const key = connectionKey ?? KEY_PLACEHOLDER;
  const snippet = assistant === "claudeCode" ? claudeCodeCommand(url, key) : claudeDesktopConfig(url, key);
  const stepId = `${id}-step`;

  return (
    <div>
      {/* One Tab stop. The arrow keys move the choice. */}
      <div role="radiogroup" aria-labelledby={labelledBy} className={`${segmentedTray} grid-cols-2`}>
        {ASSISTANTS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={assistant === a}
            onClick={() => choose(a)}
            {...roving.optionProps(a)}
            className={`${segmentButton} ${assistant === a ? segmentActive : segmentInactive}`}
          >
            {a === "claudeCode" ? t("claudeCode") : t("claudeDesktop")}
          </button>
        ))}
      </div>

      <p id={stepId} className="mt-4 text-base text-ink">
        {assistant === "claudeCode" ? t("claudeCodeStep") : t("claudeDesktopStep")}
      </p>
      {/* Focusable by code only, so a refused clipboard can select it for copying by hand. */}
      <pre ref={snippetRef} tabIndex={-1} data-snippet="" className={`mt-3 ${codeBox} ${focusRing}`}>
        <code>{snippet}</code>
      </pre>
      <div className="mt-2 grid md:flex md:justify-end">
        <CopyButton
          // A fresh button per snippet, so "Copied" never carries over to the other one.
          key={assistant}
          text={snippet}
          label={assistant === "claudeCode" ? t("copyCommand") : t("copyEntry")}
          describedBy={stepId}
          onFailed={() => {
            setCopyFailed(true);
            selectAllIn(snippetRef.current);
          }}
          onCopied={() => setCopyFailed(false)}
        />
      </div>
      <CopyFallbackLine shown={copyFailed} text={t("copyFallback")} />
      {assistant === "claudeCode" && <p className={fieldHintClass}>{t("claudeCodeHint")}</p>}
    </div>
  );
}
