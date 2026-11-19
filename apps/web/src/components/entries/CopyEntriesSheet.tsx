"use client";

import { useEntryMeta } from "@/components/day/entryMeta";
import { focusField } from "@/components/form/focus";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormSheet, type FormFailure, type FormSheetCallerProps } from "@/components/ui/FormSheet";
import { NativeDateInput } from "@/components/ui/NativeDateInput";
import { labelClass, sectionStart } from "@/components/ui/styles";
import type { EntryActions } from "@/hooks/useEntryActions";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useFormDirty } from "@/hooks/useFormDirty";
import { useToday } from "@/hooks/useToday";
import { OfflineError, unconfirmed } from "@/lib/failure";
import { formatKcal } from "@/lib/foodFormat";
import { addDays, isIsoDate } from "@/lib/localDate";
import { newId } from "@/lib/newId";
import { dayQuery } from "@/lib/queryOptions";
import type { Entry } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type ReactElement, type RefObject } from "react";

// ---------------------------------------------------------------------------
// CopyEntriesSheet: copies entries of the day on screen to another day, as
// planned entries, after what that day holds.
//
// - To is the platform's own date field. It opens on the day after the day
//   on screen, or on today when that day is past: copying last Tuesday's
//   breakfast almost always means today. Its line says each copy is a
//   planned entry, or why a date is refused.
// - The day's entries, in its order, each with its box, all ticked at open,
//   under "All entries", which ticks or clears them all and shows a dash
//   when some are ticked. The list follows the day: an entry removed on
//   another device leaves it.
// - Nothing ticked refuses in the line above the buttons, which is a live
//   region, marks "All entries" refused, puts focus there and sends nothing.
//   Nothing in the body changes, so the list keeps its place under the
//   finger. A tick clears the line.
// - A long name wraps to two lines, as on the Day tab. The list may shrink
//   below its widest name, so a name never pushes the calories off the row.
// - The ids belong to this open of the sheet. A pair of date and entry gets
//   its id the first time it is sent and keeps it, so Copy again after
//   "Could not confirm." sends the same ids and the server adds each copy
//   once. A changed date or selection sends new pairs with new ids, and once
//   that send succeeds every id sent earlier and not sent now is removed,
//   before the toast. Undo removes every id this open sent. A press that
//   sent nothing (offline, or held while the app asks for today) counts as
//   no send.
// - Cancel after a send that could not confirm reads that send's day again,
//   so whatever landed shows there. So does Cancel after a send of more than
//   100 whose later request failed once an earlier one had landed.
// - The toast shows once the sheet has slid out. A sheet that leaves the
//   page while a copy is out, such as on Back, shows the toast as the copy
//   answers, and reads again the day of a copy that could not confirm.
// - The web computes no figure here: each row shows the entry's own calories
//   as the server answered them.
// ---------------------------------------------------------------------------

export interface CopyEntriesSheetProps extends FormSheetCallerProps {
  /** The day the entries are on: the day on screen when it opened. */
  fromDate: string;
  actions: EntryActions;
}

/** Shows the toast `ref` holds, once. */
function announceOnce(ref: RefObject<(() => void) | null>): void {
  const show = ref.current;
  ref.current = null;
  show?.();
}

/** To at open: the day after `from`, or `today` when `from` is past. */
export function defaultCopyDate(from: string, today: string | null): string {
  if (today !== null && from < today) return today;
  return addDays(from, 1);
}

export function CopyEntriesSheet({
  open,
  returnFocusTo,
  onClose,
  onSaved,
  fromDate,
  actions,
}: CopyEntriesSheetProps): ReactElement {
  const t = useTranslations("entries.copy");
  const tRow = useTranslations("day.row");
  const meta = useEntryMeta();
  const errorCopy = useErrorCopy();
  const failureLine = useFailureLine("form");
  const { today } = useToday();
  const id = useId();
  const toId = `${id}-to`;
  const allId = `${id}-all`;

  const { data: day } = useQuery(dayQuery(fromDate));
  const live = day?.entries ?? [];
  // While a copy runs the list stays as it was pressed, so a copy to this
  // same day never adds rows under a closing sheet.
  const [frozen, setFrozen] = useState<readonly Entry[] | null>(null);
  const entries = frozen ?? live;

  const [to, setTo] = useState(() => defaultCopyDate(fromDate, today));
  // Every entry ticked at open. The day is on screen when Copy opens the
  // sheet, so its answer is cached, but a sheet that opens before it waits
  // for it and ticks the entries it brings.
  const [ticked, setTicked] = useState<ReadonlySet<string> | null>(() => (day ? new Set(live.map((e) => e.id)) : null));
  if (ticked === null && day) setTicked(new Set(live.map((e) => e.id)));
  const [toError, setToError] = useState<string | null>(null);
  const [noneChosen, setNoneChosen] = useState(false);
  const [formError, setFormError] = useState<FormFailure | null>(null);
  const [copying, setCopying] = useState(false);
  const { dirty } = useFormDirty(JSON.stringify({ to, ticked: [...(ticked ?? [])].sort() }), ticked !== null);

  // This open's ids: one per pair of date and entry, and every id sent with its date.
  const idsRef = useRef(new Map<string, string>());
  const sentRef = useRef(new Map<string, string>());
  // The dates of sends that could not confirm, read again on Cancel.
  const unsureRef = useRef(new Set<string>());
  // The copy's toast, shown once the sheet has slid out, or as it unmounts mid-slide.
  const announceRef = useRef<(() => void) | null>(null);
  // False once the sheet has left the page, such as on Back while a copy is
  // out: a copy that answers then shows its toast at once, and a lost answer
  // has its day read again at once, since no Cancel will come.
  const mountedRef = useRef(false);
  const actionsRef = useRef(actions);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);
  useEffect(() => {
    mountedRef.current = true;
    const pending = announceRef;
    const unsure = unsureRef.current;
    return () => {
      mountedRef.current = false;
      announceOnce(pending);
      if (unsure.size > 0) actionsRef.current.readDaysAgain([...unsure]);
      unsure.clear();
    };
  }, []);

  const chosen = entries.filter((e) => ticked?.has(e.id) === true);
  const all = entries.length > 0 && chosen.length === entries.length;
  const some = chosen.length > 0 && !all;

  function tick(next: ReadonlySet<string>): void {
    setTicked(next);
    if (noneChosen) {
      setNoneChosen(false);
      setFormError(null);
    }
  }

  function close(): void {
    if (unsureRef.current.size > 0) actions.readDaysAgain([...unsureRef.current]);
    unsureRef.current.clear();
    onClose();
  }

  async function handleSubmit(): Promise<void> {
    if (copying || actions.holding) return;
    setFormError(null);
    const dateBad = !isIsoDate(to);
    setToError(dateBad ? errorCopy.forCode("invalid_date") : null);
    setNoneChosen(chosen.length === 0);
    if (chosen.length === 0) setFormError({ line: t("none"), cause: null });
    if (dateBad) return focusField(toId);
    if (chosen.length === 0) return focusField(allId);

    const pairs = chosen.map((entry) => {
      const key = `${to}|${entry.id}`;
      let copyId = idsRef.current.get(key);
      if (copyId === undefined) {
        copyId = newId();
        idsRef.current.set(key, copyId);
      }
      return { sourceId: entry.id, id: copyId };
    });
    const firstSent = pairs.filter((p) => !sentRef.current.has(p.id));
    for (const p of firstSent) sentRef.current.set(p.id, to);
    const now = new Set(pairs.map((p) => p.id));
    const sent = [...sentRef.current].map(([copyId, date]) => ({ id: copyId, date }));
    const stale = sent.filter((c) => !now.has(c.id));
    // Nothing reached the server: these ids were not sent after all.
    const unsend = (): void => {
      for (const p of firstSent) sentRef.current.delete(p.id);
    };

    setFrozen(entries);
    setCopying(true);
    let done;
    try {
      // A request that lands makes this send's date unsure until the send succeeds.
      const onLanded = (): void => void unsureRef.current.add(to);
      done = await actions.copy({ fromDate, toDate: to, entries: pairs, stale, sent, onLanded });
    } catch (err) {
      if (err instanceof OfflineError) unsend();
      else if (unconfirmed(err)) unsureRef.current.add(to);
      if (!mountedRef.current && unsureRef.current.size > 0) {
        actions.readDaysAgain([...unsureRef.current]);
        unsureRef.current.clear();
      }
      setFormError({ line: failureLine(err), cause: err });
      setFrozen(null);
      setCopying(false);
      return;
    }
    if (done === "held") {
      unsend();
      setFrozen(null);
      setCopying(false);
      return;
    }
    unsureRef.current.clear();
    if (!mountedRef.current) return done.announce();
    // Still busy: the sheet slides out showing what was on screen.
    announceRef.current = done.announce;
    onSaved?.();
    onClose();
  }

  return (
    <FormSheet
      open={open}
      onClose={close}
      title={t("title")}
      returnFocusTo={returnFocusTo}
      dirty={dirty}
      submitting={copying}
      held={actions.holding}
      onSubmit={handleSubmit}
      formError={formError}
      idle={t("submit")}
      busy={t("busy")}
      sheet={{ panelClassName: "md:max-w-md", onClosed: () => announceOnce(announceRef) }}
    >
      {({ autoFocus }) => (
        <>
          <div>
            <label htmlFor={toId} className={labelClass}>
              {t("to")}
            </label>
            <NativeDateInput
              id={toId}
              value={to}
              onValueChange={(value) => {
                setTo(value);
                setToError(null);
              }}
              error={toError}
              hint={t("toHint")}
              autoFocus={autoFocus}
            />
          </div>
          <fieldset data-copy-list="" className={`${sectionStart} min-w-0`}>
            <legend className="sr-only">{t("list")}</legend>
            <Checkbox
              id={allId}
              checked={all}
              indeterminate={some}
              onChange={(on) => tick(on ? new Set(entries.map((e) => e.id)) : new Set())}
              aria-invalid={noneChosen || undefined}
              className="flex min-h-11 items-center gap-3 text-base font-semibold text-ink"
            >
              {t("all")}
            </Checkbox>
            <ul className="mt-1 border-t border-rule">
              {entries.map((entry) => {
                const rowId = `${id}-${entry.id}`;
                return (
                  <li key={entry.id} data-copy-entry={entry.id} className="border-b border-rule">
                    <Checkbox
                      id={rowId}
                      checked={ticked?.has(entry.id) === true}
                      onChange={(on) => {
                        const next = new Set(ticked ?? []);
                        if (on) next.add(entry.id);
                        else next.delete(entry.id);
                        tick(next);
                      }}
                      aria-labelledby={`${rowId}-name`}
                      aria-describedby={`${rowId}-detail`}
                      className="flex min-h-11 items-center gap-3 py-1"
                    >
                      <span className="min-w-0 flex-1">
                        <span id={`${rowId}-name`} className="line-clamp-2 text-base break-words text-ink">
                          {entry.name}
                        </span>
                        <span id={`${rowId}-detail`} className="flex gap-3 text-sm text-ink-muted">
                          <span className="min-w-0 flex-1 truncate">{meta(entry)}</span>
                          <span className="shrink-0 font-mono text-ink tabular-nums">
                            {entry.isEstimate && (
                              <>
                                <span aria-hidden="true">{tRow("approx")}</span>
                                <span className="sr-only">{tRow("estimated")} </span>
                              </>
                            )}
                            {tRow("kcal", { value: formatKcal(entry.figures.energyKcal) })}
                          </span>
                        </span>
                      </span>
                    </Checkbox>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </>
      )}
    </FormSheet>
  );
}
