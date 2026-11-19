import {
  ENTRY_STATUSES,
  EntryCountSchema,
  EntryStatusBodySchema,
  FoodAmountSchema,
  MAX_ENTRY_BATCH,
  NameSchema,
  NoteSchema,
  TypedFiguresSchema,
} from "@hovimestari/types";
import { z } from "zod";
import {
  recordedCopyEntries,
  recordedLogEstimate,
  recordedLogFood,
  recordedLogSavedMeal,
  recordedRemoveEntries,
  recordedRestoreEntry,
  recordedSetEntriesStatus,
  recordedUpdateEntry,
  replayCopies,
  replayEntry,
  replayEntryBatch,
  replayEntryChange,
} from "../../../services/writes/recorded/entries.js";
import { dateIn, DayDate, RequestKey } from "../../inputs.js";
import { defineWriteTool } from "./run.js";

// The entry write tools (design d.3), each through one recorded service in
// services/writes/recorded/entries.ts, which calls the service its REST
// route calls. Field names are the REST body's. A date may be `today`, the
// person's today. The tools take no entry id for a new entry: the app makes
// it, and the request key makes a retry land once.

const Status = z.enum(ENTRY_STATUSES).describe("planned, or eaten. A future date takes planned only.");
const EntryId = z.uuid().describe("The entry's id, from get_day.");
const EntryIds = (what: string) =>
  z
    .array(z.uuid())
    .min(1)
    .max(MAX_ENTRY_BATCH)
    .describe(`${what}, from get_day: 1 to ${MAX_ENTRY_BATCH} entry ids, each once.`);
const distinct = (ids: string[]) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length;
const Amount = FoodAmountSchema.describe(
  "{ grams } as weighed, or { portionId, count }: a count of one of the food's portions, from get_food.",
);

export const logFoodTool = defineWriteTool({
  name: "log_food",
  description:
    "Log or plan a food on a day, by grams or by a count of one of its portions. The figures come from the food's values now.",
  inputSchema: z.strictObject({
    requestKey: RequestKey,
    foodId: z.uuid().describe("The food's id, from search_foods, get_food or a list of foods."),
    amount: Amount,
    date: DayDate,
    status: Status,
  }),
  destructive: false,
  async run({ requestKey: _key, date, ...args }, { service, via }) {
    const { outcome, value } = await recordedLogFood(service, via, { ...args, date: dateIn(date, service.today) });
    return { outcome, data: { entry: value.entry, days: value.days } };
  },
  replay: replayEntry,
});

export const logSavedMealTool = defineWriteTool({
  name: "log_saved_meal",
  description:
    "Log or plan a saved meal on a day, by its count of meals. The figures come from the meal's figures now.",
  inputSchema: z.strictObject({
    requestKey: RequestKey,
    savedMealId: z.uuid().describe("The saved meal's id, from list_saved_meals."),
    count: EntryCountSchema.describe("How many of the meal, such as 1 or 0.5."),
    date: DayDate,
    status: Status,
  }),
  destructive: false,
  async run({ requestKey: _key, date, ...args }, { service, via }) {
    const { outcome, value } = await recordedLogSavedMeal(service, via, {
      ...args,
      date: dateIn(date, service.today),
    });
    return { outcome, data: { entry: value.entry, days: value.days } };
  },
  replay: replayEntry,
});

export const logEstimateTool = defineWriteTool({
  name: "log_estimate",
  description:
    "Log or plan an estimate: a name and four typed figures for a meal nobody can weigh. A meal judged from a photo or a description goes here, and is shown as an estimate.",
  inputSchema: z.strictObject({
    requestKey: RequestKey,
    name: NameSchema.describe("What was eaten, in the person's own words."),
    figures: TypedFiguresSchema.describe("energyKcal, proteinG, carbsG and fatG for the whole meal, as stated."),
    note: NoteSchema.nullable().optional().describe("Optional, such as where the figures came from."),
    date: DayDate,
    status: Status,
  }),
  destructive: false,
  async run({ requestKey: _key, date, ...args }, { service, via }) {
    const { outcome, value } = await recordedLogEstimate(service, via, { ...args, date: dateIn(date, service.today) });
    return { outcome, data: { entry: value.entry, days: value.days } };
  },
  replay: replayEntry,
});

const UpdateInput = z
  .strictObject({
    requestKey: RequestKey,
    entryId: EntryId,
    date: DayDate.optional().describe("Moves the entry to this date, YYYY-MM-DD, or today."),
    status: Status.optional(),
    amount: Amount.optional().describe("Food entries only: { grams } or { portionId, count }."),
    count: EntryCountSchema.optional().describe("Saved meal entries only: the count of meals."),
    name: NameSchema.optional().describe("Estimates only."),
    figures: TypedFiguresSchema.optional().describe("Estimates only: all four figures."),
    note: NoteSchema.nullable().optional().describe("Estimates only. null or an empty text clears it."),
  })
  .superRefine((input, issues) => {
    const changing = Object.entries(input).some(
      ([field, v]) => !["requestKey", "entryId"].includes(field) && v !== undefined,
    );
    if (!changing) {
      issues.addIssue({ code: "custom", message: "Give at least one field to change." });
    }
  });

export const updateEntryTool = defineWriteTool({
  name: "update_entry",
  description:
    "Change, move or mark one entry: its date, its status, a food's amount, a saved meal's count, or an estimate's name, figures and note. Its values per 100 g or per meal stay as they were when it was added.",
  inputSchema: UpdateInput,
  destructive: true,
  async run({ requestKey: _key, entryId, date, ...patch }, { service, via }) {
    const moved = date === undefined ? {} : { date: dateIn(date, service.today) };
    const { outcome, value } = await recordedUpdateEntry(service, via, entryId, { ...patch, ...moved });
    return { outcome, data: { entry: value.entry, days: value.days } };
  },
  replay: replayEntryChange,
});

export const setEntriesStatusTool = defineWriteTool({
  name: "set_entries_status",
  description:
    "Mark entries eaten or planned. Entries already in that status, not the person's, or dated after today for eaten are left alone. Answers the ids it changed.",
  inputSchema: z.strictObject({
    requestKey: RequestKey,
    entryIds: EntryStatusBodySchema.shape.entryIds.describe(
      `The entries, from get_day: 1 to ${MAX_ENTRY_BATCH} entry ids.`,
    ),
    status: z.enum(ENTRY_STATUSES).describe("eaten or planned."),
  }),
  destructive: true,
  async run({ requestKey: _key, ...args }, { service, via }) {
    const { outcome, value } = await recordedSetEntriesStatus(service, via, args);
    return { outcome, data: { changedIds: value.changedIds, days: value.days } };
  },
  async replay(service, replay) {
    const { ids, days } = await replayEntryBatch(service, replay);
    return { changedIds: ids, days };
  },
});

export const copyEntriesTool = defineWriteTool({
  name: "copy_entries",
  description:
    "Copy entries to another day. Every copy is planned, with the figures of the entry it copies, and the copies keep the order the entries have on their days.",
  inputSchema: z.strictObject({
    requestKey: RequestKey,
    entryIds: EntryIds("The entries to copy").refine(distinct, { error: "Give each entry id once." }),
    toDate: DayDate.describe("The day to copy to, YYYY-MM-DD, or today."),
  }),
  destructive: false,
  async run({ requestKey: _key, entryIds, toDate }, { service, via }) {
    const { outcome, value } = await recordedCopyEntries(service, via, {
      entryIds,
      toDate: dateIn(toDate, service.today),
    });
    return { outcome, data: { entries: value.entries, days: value.days } };
  },
  replay: replayCopies,
});

export const removeEntriesTool = defineWriteTool({
  name: "remove_entries",
  description:
    "Remove entries from their days. Ids that are not the person's or already gone are left alone. Each removed entry can be put back with restore_entry for ten minutes.",
  inputSchema: z.strictObject({
    requestKey: RequestKey,
    entryIds: EntryIds("The entries to remove").refine(distinct, { error: "Give each entry id once." }),
  }),
  destructive: true,
  async run({ requestKey: _key, ...args }, { service, via }) {
    const { outcome, value } = await recordedRemoveEntries(service, via, args);
    return { outcome, data: { removedIds: value.removedIds, days: value.days } };
  },
  async replay(service, replay) {
    const { ids, days } = await replayEntryBatch(service, replay);
    return { removedIds: ids, days };
  },
});

export const restoreEntryTool = defineWriteTool({
  name: "restore_entry",
  description:
    "Put back an entry removed in the last ten minutes, exactly as it was: the same id, values, amount and status.",
  inputSchema: z.strictObject({
    requestKey: RequestKey,
    entryId: z.uuid().describe("The removed entry's id, from the answer of remove_entries."),
  }),
  destructive: false,
  async run({ entryId }, { service, via }) {
    const { outcome, value } = await recordedRestoreEntry(service, via, entryId);
    return { outcome, data: { entry: value.entry, days: value.days } };
  },
  replay: replayEntry,
});
