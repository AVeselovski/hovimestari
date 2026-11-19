import { SavedMealEditBodySchema } from "@hovimestari/types";
import { z } from "zod";
import {
  recordedCreateSavedMeal,
  recordedSetSavedMealArchived,
  recordedUpdateSavedMeal,
  replayMeal,
} from "../../../services/writes/recorded/savedMeals.js";
import { writeInput } from "../../inputs.js";
import { defineWriteTool } from "./run.js";

// The saved-meal write tools (design d.3), each through one recorded service
// in services/writes/recorded/savedMeals.ts, which calls the service its REST
// route calls. Field names are the REST body's. The app makes a new meal's id.

const { name, source, figures } = SavedMealEditBodySchema.shape;
const MealName = name.describe("The meal's name, as the person calls it.");
const Figures = figures.describe("energyKcal, proteinG, carbsG and fatG for one meal, as read from its label or menu.");
const SavedMealId = z.uuid().describe("The saved meal's id, from list_saved_meals.");

export const createSavedMealTool = defineWriteTool({
  name: "create_saved_meal",
  description:
    "Save a meal eaten again and again, with its figures for one meal as read from a label or a menu, and an optional source such as a delivery service. It is then logged by count with log_saved_meal. Answers the meal with its id.",
  inputSchema: writeInput({
    name: MealName,
    source: source.describe("Optional: where the meal comes from, such as a delivery service, in up to 40 characters."),
    figures: Figures,
  }),
  destructive: false,
  async run(args, { service, via }) {
    const { outcome, value } = await recordedCreateSavedMeal(service, via, args);
    return { outcome, data: { meal: value } };
  },
  replay: replayMeal,
});

export const updateSavedMealTool = defineWriteTool({
  name: "update_saved_meal",
  description:
    "Change a saved meal, given whole, as the edit form saves it: its name, its source and its figures for one meal. A source left out is removed. Its planned entries from today on take the new figures, and every other entry keeps its figures.",
  inputSchema: writeInput({
    savedMealId: SavedMealId,
    name: MealName,
    source: source.describe("Where the meal comes from, or null for none. Left out, the meal has none."),
    figures: Figures,
  }),
  destructive: true,
  async run({ savedMealId, ...meal }, { service, via }) {
    const { outcome, value } = await recordedUpdateSavedMeal(service, via, savedMealId, meal);
    return { outcome, data: { meal: value } };
  },
  replay: replayMeal,
});

export const setSavedMealArchivedTool = defineWriteTool({
  name: "set_saved_meal_archived",
  description:
    "Archive a saved meal, which takes it out of the list of active meals, or bring it back. An archived meal can still be logged, and its entries keep their figures.",
  inputSchema: writeInput({
    savedMealId: SavedMealId.describe("The saved meal's id, from list_saved_meals, archived or not."),
    archived: z.boolean().describe("true to archive it, false to bring it back."),
  }),
  destructive: true,
  async run({ savedMealId, archived }, { service, via }) {
    const { outcome } = await recordedSetSavedMealArchived(service, via, savedMealId, archived);
    return { outcome, data: {} };
  },
  replay: replayMeal,
});
