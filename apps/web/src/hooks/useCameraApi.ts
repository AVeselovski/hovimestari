"use client";

import { useSyncExternalStore } from "react";

/** No event says the camera API came or went: it is there for the page's life or never. */
const subscribeNever = (): (() => void) => () => {};

/**
 * The browser can ask for a camera. Only in a secure context, so never on
 * plain http over the LAN. The search field's camera button and the barcode
 * block's Scan again both show by this one rule.
 */
export function useCameraApi(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => typeof navigator.mediaDevices?.getUserMedia === "function",
    () => false,
  );
}
