import { distinctLineIds, RecipeEditBodySchema, RecipePreviewBodySchema } from "@hovimestari/types";
import { z } from "zod";
import {
  recordedCreateRecipe,
  recordedSetRecipeArchived,
  recordedSetRecipeFavourite,
  recordedUpdateRecipe,
  replayRecipe,
} from "../../../services/writes/recorded/recipes.js";
import { writeInput } from "../../inputs.js";
import { defineWriteTool } from "./run.js";

// The recipe write tools (recipes design d.6), each through one recorded
// service in services/writes/recorded/recipes.ts, which calls the service
// its REST route calls. Field names are the REST body's. The app makes a new
// recipe's id and the id of every line sent without one.

const { name, servings, timeMinutes, steps, notes, tags } = RecipeEditBodySchema.shape;

const recipeFields = (linesHelp: string) => ({
  name: name.describe("The recipe's name, as written."),
  servings: servings.describe("How many servings the recipe makes, a whole number from 1 to 100."),
  timeMinutes: timeMinutes.describe("Optional: the cooking time in minutes, 1 to 1440, or null for none."),
  lines: RecipePreviewBodySchema.shape.lines
    .refine(distinctLineIds, { error: "Give each line id once." })
    .describe(
      "1 to 60 lines, in order. A counted line: counted true, foodId, amount as { grams } or { portionId, count } of one of " +
        "the food's portions, and optional written ({ amount, unit }, the recipe's own words for the amount) and note. " +
        `A line not counted, such as salt: counted false and name. ${linesHelp}`,
    ),
  steps: steps.describe("Optional: the method, one step per item, in order, up to 40."),
  notes: notes.describe("Optional: notes, up to 2000 characters, or null for none."),
  tags: tags.describe("Optional: the person's own tags, up to 10, each 1 to 30 characters."),
});

const RecipeId = z.uuid().describe("The recipe's id, from list_recipes.");

export const createRecipeTool = defineWriteTool({
  name: "create_recipe",
  description:
    "Save a recipe from its lines. The app computes its figures from the foods and grams of its counted lines. Call preview_recipe first and show the person its answer. Answers the recipe with its id, its lines and its figures.",
  inputSchema: writeInput(recipeFields("The app makes each line's id.")),
  destructive: false,
  async run(args, { service, via }) {
    const { outcome, value } = await recordedCreateRecipe(service, via, args);
    return { outcome, data: { recipe: value } };
  },
  replay: replayRecipe,
});

export const updateRecipeTool = defineWriteTool({
  name: "update_recipe",
  description:
    "Change a recipe, given whole, as the editor saves it: its name, servings, time, lines, steps, notes and tags. Anything left out is removed. Answers the recipe with its new figures.",
  inputSchema: writeInput({
    recipeId: RecipeId,
    ...recipeFields(
      "A line keeps its id from get_recipe to stay the same line. A line without one is new, unless it is the same in every part but its place as a line of the recipe whose id no other line sends: it then stays that line.",
    ),
  }),
  destructive: true,
  async run({ recipeId, ...recipe }, { service, via }) {
    const { outcome, value } = await recordedUpdateRecipe(service, via, recipeId, recipe);
    return { outcome, data: { recipe: value } };
  },
  replay: replayRecipe,
});

export const setRecipeArchivedTool = defineWriteTool({
  name: "set_recipe_archived",
  description:
    "Archive a recipe, which takes it out of the list of active recipes, or bring it back. An archived recipe can still be read.",
  inputSchema: writeInput({
    recipeId: RecipeId.describe("The recipe's id, from list_recipes, archived or not."),
    archived: z.boolean().describe("true to archive it, false to bring it back."),
  }),
  destructive: true,
  async run({ recipeId, archived }, { service, via }) {
    const { outcome } = await recordedSetRecipeArchived(service, via, recipeId, archived);
    return { outcome, data: {} };
  },
  replay: replayRecipe,
});

export const setRecipeFavouriteTool = defineWriteTool({
  name: "set_recipe_favourite",
  description: "Mark a recipe as one of the person's favourites, or take it off them.",
  inputSchema: writeInput({
    recipeId: RecipeId,
    favourite: z.boolean().describe("true to mark it, false to take it off."),
  }),
  destructive: true,
  async run({ recipeId, favourite }, { service, via }) {
    const { outcome } = await recordedSetRecipeFavourite(service, via, recipeId, favourite);
    return { outcome, data: {} };
  },
  replay: replayRecipe,
});
