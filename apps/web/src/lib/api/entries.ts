import { api } from "@/lib/api";
import type {
  AddEntryBody,
  CopyEntriesBody,
  CopyEntriesResult,
  EntryPatchBody,
  EntryRemoveManyResult,
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

/**
 * `POST /entries`: adds an entry with the id the app chose. Sent again with
 * the same id, it adds nothing and answers the first entry with `outcome:
 * "replayed"`, or no entry when that one was removed since.
 */
export async function addEntry(body: AddEntryBody): Promise<EntryWriteResult> {
  const res = await api.post<EntryWriteResult>("/entries", body);
  return res.data;
}

/**
 * `POST /entries/copy`: adds a planned copy of each source entry to `toDate`,
 * under the id the app chose for it, at most 100. Sent again with the same
 * ids, it adds only what did not land and answers `outcome: "replayed"` when
 * it added none.
 */
export async function copyEntries(body: CopyEntriesBody): Promise<CopyEntriesResult> {
  const res = await api.post<CopyEntriesResult>("/entries/copy", body);
  return res.data;
}

/**
 * `POST /entries/remove`: removes each listed entry that is still there, at
 * most 100 distinct ids, each restorable for ten minutes. Ids that are gone
 * are skipped, so a repeat answers empty lists.
 */
export async function removeEntries(entryIds: readonly string[]): Promise<EntryRemoveManyResult> {
  const res = await api.post<EntryRemoveManyResult>("/entries/remove", { entryIds });
  return res.data;
}
