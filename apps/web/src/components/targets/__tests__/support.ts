import type { TargetChange, TargetsOverview } from "@hovimestari/types";
import { AxiosError, type AxiosResponse } from "axios";

/** The user's today in these tests, as the server would answer it. */
export const TODAY = "2026-11-16";

/** A change on `effectiveFrom`, with its own numbers so a test can find them on screen. */
export function change(
  effectiveFrom: string,
  energy: [number, number] = [1800, 2200],
  protein: [number, number] = [120, 160],
): TargetChange {
  return {
    effectiveFrom,
    ranges: {
      energyKcal: { lower: energy[0], upper: energy[1] },
      proteinG: { lower: protein[0], upper: protein[1] },
    },
    updatedAt: "2026-11-01T08:00:00.000Z",
  };
}

/**
 * What `GET /targets` answers for `date` over `changes`: the change with the
 * latest start on or before the date, else none. A date before the first
 * change has no targets, while every change is still listed. The rule is the
 * server's, written out here only so the screen has an answer to show.
 */
export function overview(changes: TargetChange[], date: string = TODAY, today: string = TODAY): TargetsOverview {
  const sorted = [...changes].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const onOrBefore = sorted.filter((c) => c.effectiveFrom <= date);
  return { date, today, inForce: onOrBefore.at(-1) ?? null, changes: sorted };
}

/** A refusal from the API with an error code, as axios rejects. */
export function refusal(status: number, code: string): AxiosError {
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data: { message: "Server text.", code },
  } as AxiosResponse);
}
