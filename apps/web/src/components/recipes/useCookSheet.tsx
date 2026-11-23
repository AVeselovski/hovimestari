"use client";

import { parseCount } from "@/components/entries/amount";
import type { EntryActions } from "@/hooks/entryActions";
import { useFailureLine } from "@/hooks/useFailureLine";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { OfflineError } from "@/lib/failure";
import { heldRecipeForForm, readRecipeForForm } from "@/lib/recipeRead";
import type { Entry, EntryStatus, Recipe } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { CookSheet } from "./CookSheet";

// ---------------------------------------------------------------------------
// useCookSheet: the "log as made" sheet for the three places that open it,
// an entry's sheet, the log sheet's recipe view and the recipe's page. Each
// has a Log as made button that calls `open`, and renders `sheet` where its
// own sheets go: in a sheet's stacked slot, or on the page.
//
// The batch starts from the recipe's lines, so the recipe is read first when
// the device holds no fresh copy (lib/recipeRead.ts), the button busy
// meanwhile, and the sheet opens on that answer. Nothing the sheet shows is
// filled in later. A read that fails opens nothing, and the place that
// asked says why where its own failures show.
//
// The answer can arrive after the place that asked has moved on: its form
// was changed, its entry removed, its view left, another sheet opened. So
// the place is asked again when the answer arrives (`mayOpen`), and a later
// press takes the place of an earlier one. An answer that may no longer
// open the sheet does nothing at all, a failure included.
// ---------------------------------------------------------------------------

/** What a press on Log as made opens the sheet on. */
export interface CookOpening {
  recipeId: string;
  /** The entry it was pressed in: a plain entry of the recipe. */
  entry?: Entry;
  /** The day the batch was made, to start with, when there is no entry. */
  day: string;
  /** What the first row of new servings starts with, when there is no entry. */
  start?: { servings: string; status: EntryStatus };
}

/** A batch's first row from a log block: the servings typed there when they are a count, else 1, and its state. */
export function batchStartOf(form: { amount: string; status: EntryStatus }): { servings: string; status: EntryStatus } {
  return { servings: typeof parseCount(form.amount) === "number" ? form.amount : "1", status: form.status };
}

export interface CookSheetHandle {
  /**
   * Reads the recipe if it must, then opens the sheet. A second press while
   * it is read joins that read, and the sheet opens once.
   */
  open: (opener: HTMLElement, opening: CookOpening) => void;
  /** The recipe is being read for a press. */
  reading: boolean;
  isOpen: boolean;
  close: () => void;
  /** The sheet, kept while it slides out, or null. */
  sheet: ReactElement | null;
}

export interface CookSheetOptions {
  /**
   * The recipe could not be read for a press, with the line that says why.
   * Each place says it where its own failures show: an entry's sheet in its
   * footer, the log sheet on its status line, the recipe's page in a toast.
   */
  onReadFailed: (line: string, cause: unknown) => void;
  /** Given by a sheet the batch sheet is stacked on: it closes both in one update, then calls `announce`. */
  onLogged?: (announce: () => void) => void;
  /**
   * Whether the place that asked can still take the sheet, asked when a
   * recipe read answers: its own form unchanged, its view still on that
   * recipe, no other sheet open. Read as the latest render gave it.
   */
  mayOpen: (opening: CookOpening) => boolean;
}

export function useCookSheet(
  actions: Pick<EntryActions, "logCook" | "holding">,
  { onReadFailed, onLogged, mayOpen }: CookSheetOptions,
): CookSheetHandle {
  const client = useQueryClient();
  const failureLine = useFailureLine("form");
  const offline = useKnownOffline();
  const target = useSheetTarget<CookOpening & { recipe: Recipe }>();
  const [reading, setReading] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Set after each render, never during one: an answer reads what the host says now.
  const host = useRef({ mayOpen, onReadFailed });
  useLayoutEffect(() => {
    host.current = { mayOpen, onReadFailed };
  });
  // One ticket per press that reads: only the latest press's answer counts.
  const presses = useRef(0);

  const { open: openTarget } = target;
  function open(opener: HTMLElement, opening: CookOpening): void {
    const held = heldRecipeForForm(client, opening.recipeId, offline);
    if (held) {
      openTarget(opener, { ...opening, recipe: held });
      return;
    }
    presses.current += 1;
    const ticket = presses.current;
    const current = (): boolean => mounted.current && ticket === presses.current;
    /** Whether this press's answer may still act: the host is there, no later press took its place, and the host agrees. */
    const may = (): boolean => current() && host.current.mayOpen(opening);
    setReading(true);
    void readRecipeForForm(client, opening.recipeId, offline)
      .then((recipe) => {
        if (!may()) return;
        if (recipe === null) host.current.onReadFailed(failureLine(new OfflineError()), new OfflineError());
        else openTarget(opener, { ...opening, recipe });
      })
      .catch((err: unknown) => {
        if (may()) host.current.onReadFailed(failureLine(err), err);
      })
      .finally(() => {
        if (current()) setReading(false);
      });
  }

  const shown = target.shown;
  const sheet = shown ? (
    <CookSheet
      key={`cook-${shown.key}`}
      open={target.isOpen}
      onClose={target.close}
      returnFocusTo={shown.opener}
      recipe={shown.value.recipe}
      entry={shown.value.entry}
      day={shown.value.day}
      start={shown.value.start}
      actions={actions}
      onLogged={onLogged}
    />
  ) : null;
  return { open, reading, isOpen: target.isOpen, close: target.close, sheet };
}
