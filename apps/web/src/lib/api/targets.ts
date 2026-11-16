import { api, type RequestOptions } from "@/lib/api";
import type { IsoDate, SetTargetsBody, TargetChange, TargetsOverview } from "@hovimestari/types";

/** `GET /targets`: the targets in force on `date` (the user's today when left out), every change, and today. */
export async function getTargets(date: IsoDate | undefined, req?: RequestOptions): Promise<TargetsOverview> {
  const res = await api.get<TargetsOverview>("/targets", {
    params: date === undefined ? undefined : { date },
    signal: req?.signal,
  });
  return res.data;
}

/** `PUT /targets/:effectiveFrom`: saves the change that starts on `effectiveFrom`, or replaces the one there. */
export async function putTargets(effectiveFrom: IsoDate, body: SetTargetsBody): Promise<TargetChange> {
  const res = await api.put<TargetChange>(`/targets/${effectiveFrom}`, body);
  return res.data;
}

/** `DELETE /targets/:effectiveFrom`. The last change cannot be removed (409 `targets_last_change`). */
export async function deleteTargets(effectiveFrom: IsoDate): Promise<void> {
  await api.delete(`/targets/${effectiveFrom}`);
}
