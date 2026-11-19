"use client";

import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, btnWide, sectionTitle } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { getErrorCode } from "@/lib/errors";
import { failureLine } from "@/lib/failure";
import { foodDetailQuery } from "@/lib/queryOptions";
import type { BarcodeLookup, FoodDetail } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, type ReactElement, type ReactNode } from "react";
import { FoodRow } from "./FoodRow";
import type { OwnFoodStart } from "./ownFoodForm";
import type { BarcodeLookupState } from "./useBarcodeLookup";

// ---------------------------------------------------------------------------
// BarcodeResult: the log sheet's search view while the field holds a
// barcode. One block under the field, in place of the saved meals and the
// food results: "Barcode {code}" over the state of its lookup.
//
// - Typed: Look up, the one action on screen, over a line that says where it
//   looks. Pressed, the same button turns busy, so focus stays on it and
//   nothing moves.
// - Found: the food's row, which opens it. The sheet has already opened the
//   food view when it could.
// - Not found, a shop's own number, incomplete: a line that says so, and the
//   own-food form to add it from the label.
// - Failed: the error's line, with Try again where trying again can help.
// - Offline, with nothing found: a line that says a lookup needs a
//   connection, and no button. It lasts only while the app knows it is
//   offline.
//
// The heading row is the same in every state and the block holds a fixed
// least height, so an answer never moves the heading or pulls up what is
// under the block. One live region says each state as it arrives. The
// visible line repeats it for the eye only, so a screen reader reads it once.
// When a state takes away the control that held focus, or focus has fallen
// out of every control, the block itself takes focus.
// ---------------------------------------------------------------------------

export interface BarcodeResultProps {
  code: string;
  /** The lookup of this code, or null when it has not been looked up. */
  state: BarcodeLookupState | null;
  /** The app knows it is offline. */
  offline: boolean;
  onLookUp: () => void;
  /** Opens the found food, as its detail, so its last amount comes with it. */
  onOpenFood: (food: FoodDetail, opener: HTMLElement) => void;
  onFromLabel: (start: OwnFoodStart, opener: HTMLElement) => void;
}

/** The attribute the block carries, for tests and for measuring it. */
export const BARCODE_RESULT_ATTRIBUTE = "data-barcode-result";

/** The list name of the found food's row, so focus finds it again on Back. */
export const BARCODE_LIST = "barcode";

/** What the block shows: a lookup's state, or offline in place of none or of a failure. */
type Shown = "typed" | "offline" | "pending" | "failed" | BarcodeLookup["result"];

type T = ReturnType<typeof useTranslations<"foods.barcode">>;

const CONTROL = "button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export function BarcodeResult({
  code,
  state,
  offline,
  onLookUp,
  onOpenFood,
  onFromLabel,
}: BarcodeResultProps): ReactElement {
  const t = useTranslations("foods.barcode");
  const tSheet = useTranslations("foods.sheet");
  const errors = useErrorCopy();
  const headingId = `${useId()}-barcode`;
  const blockRef = useRef<HTMLElement>(null);

  const shown: Shown =
    offline && (state === null || state.status === "failed")
      ? "offline"
      : state === null
        ? "typed"
        : state.status === "answered"
          ? state.answer.result
          : state.status;

  // A state that took away the control holding focus leaves focus on the
  // page, on a node gone from it, or on a reused button that now says
  // something else: the block takes it. Pending keeps focus on the busy
  // button it was pressed as. Focus on a control outside the block, such as
  // the search field, or anywhere in a sheet stacked on this one, stays.
  const lastShown = useRef(shown);
  useLayoutEffect(() => {
    const block = blockRef.current;
    if (lastShown.current === shown || block === null) return;
    lastShown.current = shown;
    const active = document.activeElement;
    // Focus in another sheet, such as the label form stacked on this one, is that sheet's.
    const home = block.closest('[role="dialog"]') ?? document.body;
    if (active !== null && active !== document.body && active.isConnected && !home.contains(active)) return;
    const lost = active === null || active === document.body || !active.isConnected || !active.matches(CONTROL);
    if (lost || (shown !== "pending" && block.contains(active))) block.focus({ preventScroll: true });
  }, [shown]);

  const fromLabel = (start: OwnFoodStart, label: string): ReactElement => (
    <button type="button" onClick={(e) => onFromLabel(start, e.currentTarget)} className={btnWide}>
      {label}
    </button>
  );
  const withBarcode: OwnFoodStart = { barcode: code };

  /** The line on screen, for the eye only. */
  let line: string | null = null;
  /** What the live region says. */
  let live = "";
  let body: ReactNode = null;
  if (shown === "offline") {
    line = t("offline");
  } else if (state === null || state.status === "pending") {
    const pending = state !== null;
    live = pending ? t("lookingUp") : "";
    body = (
      <button
        type="button"
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onClick={onLookUp}
        className={`${btnPrimary} w-full`}
      >
        <StableLabel active={pending} idle={t("lookUp")} busy={t("lookingUp")} />
      </button>
    );
  } else if (state.status === "answered" && state.answer.result === "found") {
    live = t("found", { name: state.answer.food.name });
    body = <FoundRow food={state.answer.food} onOpen={onOpenFood} />;
  } else if (state.status === "answered" && state.answer.result !== "found") {
    const answer = state.answer;
    line = answerLine(t, answer, code);
    body =
      answer.result === "incomplete"
        ? fromLabel(
            {
              barcode: answer.barcode,
              name: answer.product.name ?? undefined,
              per100g: answer.product.per100g,
              fromProduct: true,
            },
            t("completeFromLabel"),
          )
        : fromLabel(answer.result === "in_store" ? {} : withBarcode, t("addFromLabel"));
  } else if (state.status === "failed") {
    // The code picks the buttons, and a lookup's own refusal its own line.
    const refusal = lookupRefusal(state.error);
    line =
      refusal !== null
        ? errors.forError(state.error)
        : failureLine(state.error, { offline: t("offline"), unconfirmed: t("failed") }, errors.forError);
    const retry = refusal !== "barcode_lookup_limit" && (
      <button type="button" onClick={onLookUp} className={btnWide}>
        {tSheet("tryAgain")}
      </button>
    );
    const label = refusal !== null && fromLabel(withBarcode, t("addFromLabel"));
    // One button over the other, so a long label never wraps beside a short one.
    body = (
      <div className="flex flex-col gap-2">
        {retry}
        {label}
      </div>
    );
  }
  if (line !== null) live = line;

  return (
    <section
      ref={blockRef}
      tabIndex={-1}
      aria-labelledby={headingId}
      {...{ [BARCODE_RESULT_ATTRIBUTE]: shown }}
      // The least height holds the tallest state at 320 pixels wide, a failure
      // with its two-line line and Try again over Add it from the label, so no
      // answer pulls up what is under the block.
      className="min-h-52 outline-none"
    >
      <h3 id={headingId} className={`${sectionTitle} mb-2`}>
        {t.rich("heading", {
          code,
          digits: (chunks) => <span className="font-mono normal-case tracking-normal">{chunks}</span>,
        })}
      </h3>
      {/* Says each state as it arrives. Always in the page, so it is announced. */}
      <p aria-live="polite" className="sr-only">
        {live}
      </p>
      <div className="flex flex-col items-stretch gap-4">
        {line !== null && (
          <p data-barcode-line="" aria-hidden="true" className="text-base break-words text-ink">
            {line}
          </p>
        )}
        {body}
        {/* Under Look up, not over it: at 320 by 568 the line's two rows would push Look up under the keyboard. */}
        {(shown === "typed" || shown === "pending") && (
          <p data-barcode-hint="" className="text-base text-ink-muted">
            {t("lookUpHint")}
          </p>
        )}
      </div>
    </section>
  );
}

/** The found food's row, from the cached detail so a star pressed in its view shows here. Reads nothing. */
function FoundRow({
  food,
  onOpen,
}: {
  food: FoodDetail;
  onOpen: (food: FoodDetail, opener: HTMLElement) => void;
}): ReactElement {
  const cached = useQuery({ ...foodDetailQuery(food.id), enabled: false }).data ?? food;
  return (
    <ul data-list={BARCODE_LIST}>
      <FoodRow food={cached} onOpen={(_row, opener) => onOpen(cached, opener)} />
    </ul>
  );
}

/** The line for an answer other than `found`. */
function answerLine(t: T, answer: Exclude<BarcodeLookup, { result: "found" }>, code: string): string {
  switch (answer.result) {
    case "not_found":
      return t("notFound", { code });
    case "in_store":
      return t("inStore");
    case "incomplete": {
      const name = answer.product.name;
      if (answer.reason === "missing_values") return name ? t("missingValues", { name }) : t("missingValuesNoName");
      return name ? t("implausibleValues", { name }) : t("implausibleValuesNoName");
    }
  }
}

/** The lookup's own refusals, each with its own line and a way to add the food from the label. */
function lookupRefusal(
  error: unknown,
): "barcode_lookup_unavailable" | "barcode_lookup_busy" | "barcode_lookup_limit" | null {
  const code = getErrorCode(error);
  return code === "barcode_lookup_unavailable" || code === "barcode_lookup_busy" || code === "barcode_lookup_limit"
    ? code
    : null;
}
