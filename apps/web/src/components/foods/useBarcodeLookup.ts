"use client";

import { useKnownOffline } from "@/hooks/useKnownOffline";
import { lookupBarcode } from "@/lib/api/foods";
import { sameBarcode } from "@/lib/barcode";
import { afterBarcodeFound } from "@/lib/invalidation";
import type { BarcodeFormat, BarcodeLookup, FoodDetail } from "@hovimestari/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// useBarcodeLookup: the log sheet's lookup of a barcode. A lookup is a write
// (it may keep a product and records that this user looked it up), so it is
// a mutation, never a query: no food write can refetch it, and nothing is
// sent while typing, only on a press.
//
// The hook holds one code and what is known of it: pending, its answer, or
// why it failed.
//
// - A press for the code already pending sends nothing.
// - A press for another code takes over: the earlier answer is dropped when
//   it lands, compared by its ticket.
// - Offline, a press sends nothing and holds nothing. `offline` is read from
//   the app's known-offline state at every render, so the block says so only
//   while it is true, and **Look up** is back the moment the connection is.
// - `drop` forgets the code, as when the typed text stops naming it. An
//   answer on its way for it is dropped too.
// - `forget` drops a found answer for a food that is no longer true to it:
//   deleted, gone, or saved with another barcode.
// - A `found` answer calls `onFound`, and the host decides whether the
//   person is still where a food view may open.
// - The food's detail goes into the cache, and a lookup that made the food
//   visible marks every cached search stale. Both run in the mutation's own
//   `onSuccess`, which runs even after the sheet has unmounted, unlike a
//   callback passed to one `mutate` call.
// - After an own food is saved, `savedOwnFood` turns the held answer into
//   `found` with that food, with no request, when the saved barcode is the
//   held code. A found answer for that food whose barcode no longer matches
//   is forgotten.
//
// The held code is the search field's text. A scan from the camera sets the
// field's text to the code it read and then looks it up, so the held answer,
// the block that shows it and the food view it opens all key on one thing.
// The scanner first reads what it decoded with `barcodeOf`: a read the field
// would not take as typed (an add-on, more than 14 digits, anything that is
// not 8 to 14 digits) is no barcode read, sends nothing, and the scanner
// keeps looking.
//
// `format` comes with a scan only, and is held with the code, so Try again
// and Enter send it again. A press for the code and format already pending
// sends nothing. A number typed by hand drops the held code with its format.
//
// A lookup is never aborted, not on a newer press and not on unmount: the
// server may already have stored the product, and its answer still seeds the
// cache and marks the searches stale.
// ---------------------------------------------------------------------------

/** What is known of the held code. */
export type BarcodeLookupState = { code: string; format?: BarcodeFormat } & (
  { status: "pending" } | { status: "answered"; answer: BarcodeLookup } | { status: "failed"; error: unknown }
);

export interface BarcodeLookupHandle {
  /** The held code and what is known of it, or null when none is held. */
  state: BarcodeLookupState | null;
  /** The app knows it is offline, so a lookup cannot be sent. */
  offline: boolean;
  /** Looks `code` up, with a scan's `format`, unless that code and format are pending or the app is offline. */
  lookUp: (code: string, format?: BarcodeFormat) => void;
  /** Forgets the held code. An answer on its way is dropped when it lands. */
  drop: () => void;
  /** Forgets a found answer for the food `foodId`. Any other answer stays. */
  forget: (foodId: string) => void;
  /** An own food was saved: the held answer turns into `found` when its barcode is the held code. */
  savedOwnFood: (food: FoodDetail) => boolean;
}

export interface UseBarcodeLookupOptions {
  /** A lookup found a food, and the code is still the one held. */
  onFound: (food: FoodDetail, code: string) => void;
}

export function useBarcodeLookup({ onFound }: UseBarcodeLookupOptions): BarcodeLookupHandle {
  const client = useQueryClient();
  const offline = useKnownOffline();
  const [state, setState] = useState<BarcodeLookupState | null>(null);
  // The lookup the hook waits for. A ticket per press, so a press of "Try again" for one code is a new lookup.
  const waiting = useRef<{ code: string; format?: BarcodeFormat; ticket: number } | null>(null);
  const tickets = useRef(0);
  const onFoundRef = useRef(onFound);
  useLayoutEffect(() => {
    onFoundRef.current = onFound;
  });

  const { mutateAsync } = useMutation({
    // Never paused: the hook sends nothing offline, and a lookup out when the connection drops fails rather than waits.
    networkMode: "always",
    mutationFn: ({ code, format }: { code: string; format?: BarcodeFormat }) => lookupBarcode(code, format),
    onSuccess: (answer) => {
      if (answer.result === "found") void afterBarcodeFound(client, answer.food, answer.newlyVisible);
    },
  });

  const lookUp = useCallback(
    (code: string, format?: BarcodeFormat) => {
      if (offline || (waiting.current?.code === code && waiting.current.format === format)) return;
      tickets.current += 1;
      const ticket = tickets.current;
      waiting.current = { code, format, ticket };
      const held = format === undefined ? { code } : { code, format };
      setState({ ...held, status: "pending" });
      const current = () => waiting.current?.ticket === ticket;
      mutateAsync({ code, format }).then(
        (answer) => {
          if (!current()) return;
          waiting.current = null;
          setState({ ...held, status: "answered", answer });
          if (answer.result === "found") onFoundRef.current(answer.food, code);
        },
        (error: unknown) => {
          if (!current()) return;
          waiting.current = null;
          setState({ ...held, status: "failed", error });
        },
      );
    },
    [mutateAsync, offline],
  );

  const drop = useCallback(() => {
    waiting.current = null;
    setState(null);
  }, []);

  const forget = useCallback((foodId: string) => {
    setState((held) =>
      held?.status === "answered" && held.answer.result === "found" && held.answer.food.id === foodId ? null : held,
    );
  }, []);

  const savedOwnFood = useCallback(
    (food: FoodDetail): boolean => {
      if (state === null || state.status === "pending") return false;
      if (food.barcode === null || !sameBarcode(food.barcode, state.code)) {
        forget(food.id);
        return false;
      }
      setState({ ...state, status: "answered", answer: { result: "found", food, newlyVisible: false } });
      return true;
    },
    [state, forget],
  );

  return { state, offline, lookUp, drop, forget, savedOwnFood };
}
