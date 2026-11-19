import { onlineManager } from "@tanstack/react-query";

/**
 * True when `work` settles within `ms`. False after `ms`, and at once while
 * or as soon as the device is offline, where a read waits for the connection.
 */
export function settledWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    let unsubscribe = (): void => {};
    const end = (settled: boolean): void => {
      clearTimeout(timer);
      unsubscribe();
      resolve(settled);
    };
    const timer = setTimeout(() => end(false), ms);
    unsubscribe = onlineManager.subscribe((online) => {
      if (!online) end(false);
    });
    if (!onlineManager.isOnline()) end(false);
    work.then(
      () => end(true),
      () => end(true),
    );
  });
}
