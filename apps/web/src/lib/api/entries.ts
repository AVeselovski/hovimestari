import { api } from "@/lib/api";
import type {
  EntryPatchBody,
  EntryRemoveResult,
  EntryStatus,
  EntryStatusResult,
  EntryWriteResult,
} from "@hovimestari/types";

/**
 * `POST /entries/status`: marks the listed entries, at most 100, and answers
 * the ids it changed and their days. An entry already in that state, gone, or
 * eaten on a future date is skipped.
 */
export async function setEntriesStatus(entryIds: readonly string[], status: EntryStatus): Promise<EntryStatusResult> {
  const res = await api.post<EntryStatusResult>("/entries/status", { entryIds, status });
  return res.data;
}

/** `PATCH /entries/:id`: changes the fields sent, and answers the entry and every day it touched. */
export async function patchEntry(id: string, patch: EntryPatchBody): Promise<EntryWriteResult> {
  const res = await api.patch<EntryWriteResult>(`/entries/${id}`, patch);
  return res.data;
}

/** `DELETE /entries/:id`: removes the entry, restorable for ten minutes. Answers its day. */
export async function removeEntry(id: string): Promise<EntryRemoveResult> {
  const res = await api.delete<EntryRemoveResult>(`/entries/${id}`);
  return res.data;
}

/** `POST /entries/:id/restore`: brings a removed entry back exactly as it was. Answers 200 when it is already back. */
export async function restoreEntry(id: string): Promise<EntryWriteResult> {
  const res = await api.post<EntryWriteResult>(`/entries/${id}/restore`);
  return res.data;
}
