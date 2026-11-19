import { z } from "zod";
import { getSavedMeal, listSavedMeals } from "../../services/reads/savedMeals.js";
import { defineTool } from "../result.js";

// Saved meals (design d.3), through the services GET /saved-meals and
// GET /saved-meals/:id call. Each answers the route's own fields.
// `archived` is a boolean here: the route's query takes the strings "true"
// and "false" because a query string has no booleans.

export const listSavedMealsTool = defineTool({
  name: "list_saved_meals",
  description:
    "The person's saved meals in alphabetical order, each with its source, its figures for one meal and the count last eaten. Active meals, or archived ones with archived true.",
  inputSchema: z.strictObject({
    archived: z.boolean().default(false).describe("true lists the archived meals instead of the active ones."),
  }),
  async run(args, { read }) {
    return { meals: await listSavedMeals(read, args) };
  },
});

export const getSavedMealTool = defineTool({
  name: "get_saved_meal",
  description:
    "One saved meal, archived or not: its name, its source, its figures for one meal and the count last eaten.",
  inputSchema: z.strictObject({
    savedMealId: z.uuid().describe("The meal's id, from list_saved_meals or list_recent_items."),
  }),
  run: ({ savedMealId }, { read }) => getSavedMeal(read, savedMealId),
});
