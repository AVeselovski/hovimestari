"use client";

import type { ConnectionReveal } from "@/components/ConnectionRevealProvider";
import { BottomSheet, SheetDescription } from "@/components/ui/BottomSheet";
import { btnPrimary, codeBox, focusRing } from "@/components/ui/styles";
import { useArmedAtRest } from "@/hooks/useArmedAtRest";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type ReactElement } from "react";
import { ConnectionInstructions } from "./ConnectionInstructions";
import { CopyButton, CopyFallbackLine, selectAllIn } from "./CopyButton";

interface KeyRevealSheetProps {
  /** The key waiting in the reveal store, or null. The sheet is open while it is set. */
  reveal: ConnectionReveal | null;
  /** The MCP endpoint the setup steps point at. */
  url: string;
  /** "I have copied it", the one way out. */
  onDone: () => void;
}

/**
 * The key, once, with the setup steps that use it. A `BottomSheet` that
 * refuses Escape, a press outside and a swipe: only "I have copied it" leaves
 * it. It opens whenever the reveal store holds a key, so it opens again with
 * the same key when Settings mounts again after a navigation.
 *
 * The store is emptied the moment "I have copied it" is pressed. This sheet
 * keeps its own copy only while it slides out, so it leaves showing what was
 * on screen, and drops it once it is gone or unmounted.
 *
 * The sheet returns focus nowhere on close. The section moves it to the new
 * row (`ConnectedAiSection`), so focus goes from "I have copied it" straight
 * to the row, with no stop on the control that opened the create sheet.
 *
 * "I have copied it" takes a press on a phone only once the sheet is at rest
 * (`useArmedAtRest`): the sheet rises under the finger that pressed Create
 * key, and a second tap must not dismiss a key nobody has seen yet.
 */
export function KeyRevealSheet({ reveal, url, onDone }: KeyRevealSheetProps): ReactElement | null {
  const t = useTranslations("settings.connectedAi.reveal");
  const [shown, setShown] = useState<ConnectionReveal | null>(reveal);
  if (reveal !== null && reveal !== shown) setShown(reveal);
  const open = reveal !== null;
  const arming = useArmedAtRest(open, useIsMobile());

  if (!shown) return null;
  return (
    <BottomSheet
      open={open}
      onClose={() => {}}
      title={t("title")}
      dismissible={false}
      restoreFocusOnClose={false}
      panelClassName="md:max-w-lg"
      onOpened={arming.onOpened}
      onClosed={() => setShown(null)}
      footer={
        <div className="grid md:flex md:justify-end">
          <button type="button" {...arming.pressProps(onDone)} className={btnPrimary}>
            {t("done")}
          </button>
        </div>
      }
    >
      <RevealBody connectionKey={shown.key} url={url} />
    </BottomSheet>
  );
}

/** The fewest characters the key's last line holds, so no line is a stray character or two. */
export const KEY_TAIL_MIN = 4;

/**
 * The key as one token over as many lines as it needs. It breaks between any
 * two characters (`break-all` on its box), and never just after a hyphen: a
 * line that ended in the key's own hyphen would read as a word broken in two,
 * and someone copying by hand could drop it. Each run of hyphens is kept on
 * one line with the character after it. The key's last few characters are
 * kept on one line too (`KEY_TAIL_MIN`), so when the key only just overflows
 * a line, the next line holds a short group and not one lone character. The
 * text is the key exactly, so a selection copies it whole.
 */
export function KeyText({ text }: { text: string }): ReactElement {
  // A unit never breaks inside: one character, or a run of hyphens with the character after it.
  const units = text.match(/-+[^-]?|[^-]/g) ?? [];
  let tail = "";
  while (units.length > 0 && tail.length < KEY_TAIL_MIN) tail = (units.pop() ?? "") + tail;
  // Single characters run together as plain text, where the box may break them anywhere.
  const parts: { text: string; whole: boolean }[] = [];
  for (const unit of units) {
    const last = parts.at(-1);
    if (unit.length === 1 && last && !last.whole) last.text += unit;
    else parts.push({ text: unit, whole: unit.length > 1 });
  }
  if (tail !== "") parts.push({ text: tail, whole: true });
  return (
    <>
      {parts.map((part, i) =>
        part.whole ? (
          <span key={i} className="whitespace-nowrap">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

/** The key, its Copy, the setup steps with the real key, and what to do if it is lost. */
function RevealBody({ connectionKey, url }: { connectionKey: string; url: string }): ReactElement {
  const t = useTranslations("settings.connectedAi.reveal");
  const tSetup = useTranslations("settings.connectedAi.setup");
  const id = useId();
  const bodyId = `${id}-body`;
  const setupId = `${id}-setup`;
  const keyRef = useRef<HTMLDivElement>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  return (
    <div>
      <SheetDescription className="text-base font-semibold text-ink">
        <span id={bodyId}>{t("body")}</span>
      </SheetDescription>
      <div
        ref={keyRef}
        role="textbox"
        aria-readonly="true"
        aria-label={t("keyLabel")}
        tabIndex={0}
        data-connection-key=""
        className={`mt-3 select-all break-all ${codeBox} ${focusRing}`}
      >
        <KeyText text={connectionKey} />
      </div>
      <div className="mt-2 grid md:flex md:justify-end">
        <CopyButton
          text={connectionKey}
          label={t("copyKey")}
          describedBy={bodyId}
          autoFocus
          onFailed={() => {
            setCopyFailed(true);
            // The browser refused the clipboard: the key is selected, ready to copy by hand.
            selectAllIn(keyRef.current);
          }}
          onCopied={() => setCopyFailed(false)}
        />
      </div>
      <CopyFallbackLine shown={copyFailed} text={t("copyFallback")} />

      <section aria-labelledby={setupId} className="mt-6 border-t border-rule pt-5">
        <h3 id={setupId} className="mb-3 text-lg font-semibold text-ink">
          {tSetup("heading")}
        </h3>
        <ConnectionInstructions url={url} connectionKey={connectionKey} labelledBy={setupId} />
      </section>

      <p className="mt-6 text-base text-ink-muted">{t("lost")}</p>
    </div>
  );
}
