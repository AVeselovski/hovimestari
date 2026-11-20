import {
  CookLineDraftSchema,
  distinctFromLines,
  distinctLineIds,
  ENTRY_STATUSES,
  EntryCountSchema,
  linesOf,
  MAX_COOK_ENTRIES,
  NameSchema,
  RecipeServingsSchema,
} from "@hovimestari/types";
import { z } from "zod";
import { recordedLogCook, recordedSaveCookAsRecipe, replayCook } from "../../../services/writes/recorded/cooks.js";
import { replayRecipe } from "../../../services/writes/recorded/recipes.js";
import { dateIn, DayDate, writeInput } from "../../inputs.js";
import { defineWriteTool } from "./run.js";

// The cook write tools (recipes design d.6), each through one recorded
// service in services/writes/recorded/cooks.ts, which calls the service its
// REST route calls. Field names are the REST body's. The app makes the
// cook's id, every line's id and every new entry's id.

const Status = z.enum(ENTRY_STATUSES);
const EntryIds = z.array(z.uuid()).max(MAX_COOK_ENTRIES);

export const logCookTool = defineWriteTool({
  name: "log_cook",
  description:
    "Log a batch of a recipe as it was made, when it came out different from the recipe: its own lines and the servings it gave. The recipe stays as written. The entries the batch fed take its figures: plain entries of the recipe it attaches, and new servings it adds. Nothing else on their days changes. Answers the batch with its figures and what it changed from the recipe, the entries and their days.",
  inputSchema: writeInput({
    recipeId: z.uuid().describe("The recipe's id, from list_recipes or get_recipe."),
    date: DayDate.describe("The day the batch was made, YYYY-MM-DD, or today."),
    servings: RecipeServingsSchema.describe("How many servings the batch gave, a whole number from 1 to 100."),
    lines: linesOf(CookLineDraftSchema)
      .refine(distinctLineIds, { error: "Give each line id once." })
      .refine(distinctFromLines, { error: "Give each fromLineId once." })
      .describe(
        "The batch's lines, as create_recipe takes them, each with fromLineId: the id of the recipe line it started as, from get_recipe, or null for a line the batch added. Leave out a line the batch left out. The app makes each line's id.",
      ),
    attach: EntryIds.default([]).describe(
      "The person's plain entries of this recipe that came from this batch, from get_day: entries of kind recipe with no cook.",
    ),
    attachStatus: z
      .array(z.object({ id: z.uuid(), status: Status }))
      .max(MAX_COOK_ENTRIES)
      .default([])
      .describe(
        "Optional: a status to set on an attached entry at the same time, such as eaten. A future date takes planned only.",
      ),
    add: z
      .array(
        z.object({
          date: DayDate,
          status: Status,
          servings: EntryCountSchema.describe("How many servings, such as 1 or 1.5."),
        }),
      )
      .max(MAX_COOK_ENTRIES)
      .default([])
      .describe("New servings from the batch, each on its day. At least one entry, attached or added."),
  }),
  destructive: false,
  async run({ date, add, ...args }, { service, via }) {
    const { outcome, value } = await recordedLogCook(service, via, {
      ...args,
      date: dateIn(date, service.today),
      add: add.map((a) => ({ ...a, date: dateIn(a.date, service.today) })),
    });
    return { outcome, data: { cook: value.cook, entries: value.entries, days: value.days } };
  },
  replay: replayCook,
});

export const saveCookAsRecipeTool = defineWriteTool({
  name: "save_cook_as_recipe",
  description:
    "Save a batch logged as made as a new recipe of its own: the batch's lines and servings, with its recipe's time, steps, notes and tags. The batch, its entries and its recipe stay as they are. Answers the new recipe.",
  inputSchema: writeInput({
    cookId: z.uuid().describe("The batch's id, from log_cook or cook.id on an entry from get_day."),
    name: NameSchema.describe("The new recipe's name, as the person gives it."),
  }),
  destructive: false,
  async run({ cookId, name }, { service, via }) {
    const { outcome, value } = await recordedSaveCookAsRecipe(service, via, cookId, name);
    return { outcome, data: { recipe: value } };
  },
  replay: replayRecipe,
});
