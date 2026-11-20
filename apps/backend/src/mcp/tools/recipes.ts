import { RecipeFilterSchema, RecipePreviewBodySchema, RecipeServingsSchema } from "@hovimestari/types";
import { z } from "zod";
import { getRecipe, listRecipes, previewRecipe } from "../../services/reads/recipes.js";
import { defineTool } from "../result.js";

// Recipes (recipes design d.6), through the services GET /recipes,
// GET /recipes/:id and POST /recipes/preview call. Each answers the route's
// own fields. The filter takes JSON booleans and lists, where the route's
// query takes strings, and both parse to one filter for the one service.

const { archived, q, tags, minProteinG, maxProteinG, minEnergyKcal, maxEnergyKcal, favourites, sort } =
  RecipeFilterSchema.shape;

export const listRecipesTool = defineTool({
  name: "list_recipes",
  description:
    "The person's recipes, each with its servings, tags, whether it is a favourite and its figures for one serving (perServing). No recipe can be put on a day yet, so lastPutOn and lastServings are null. Active recipes, or archived ones with archived true. Every filter is optional.",
  inputSchema: z.strictObject({
    archived: archived.describe("true lists the archived recipes instead of the active ones."),
    q: q.describe("Words that must each be in the recipe's name or one of its tags, case and accents ignored."),
    tags: tags.describe("Recipes with every one of these tags."),
    minProteinG: minProteinG.describe("At least this much protein in one serving, as shown."),
    maxProteinG: maxProteinG.describe("At most this much protein in one serving, as shown."),
    minEnergyKcal: minEnergyKcal.describe("At least this many kcal in one serving, as shown."),
    maxEnergyKcal: maxEnergyKcal.describe("At most this many kcal in one serving, as shown."),
    favourites: favourites.describe("true lists the favourites only."),
    sort: sort.describe(
      "name (alphabetical), protein (most per serving first) or energy (fewest kcal per serving first). lastPutOn sorts as name while no recipe is on a day.",
    ),
    limit: z.number().int().min(1).max(200).optional().describe("At most this many recipes, 1 to 200."),
  }),
  async run(args, { service }) {
    return { recipes: await listRecipes(service, args) };
  },
});

export const getRecipeTool = defineTool({
  name: "get_recipe",
  description:
    "One recipe, archived or not: its lines with each food and its grams, its steps, notes and tags, and its figures for one serving (perServing) and for all its servings (whole). With servings, also scaled: the lines' amounts and the figures at that many servings.",
  inputSchema: z.strictObject({
    recipeId: z.uuid().describe("The recipe's id, from list_recipes."),
    servings: RecipeServingsSchema.optional().describe("Optional: the recipe at this many servings, 1 to 100."),
  }),
  run: ({ recipeId, servings }, { service }) => getRecipe(service, recipeId, { servings }),
});

const { servings, lines } = RecipePreviewBodySchema.shape;

export const previewRecipeTool = defineTool({
  name: "preview_recipe",
  description:
    "What a recipe draft comes to, before it is saved. Writes nothing. For every line by its index from 0: the food's name as the app reads it, the grams the app will store, the portion a count was of, and the refusal of that line or null. Then perServing and whole, null while a line is refused, and the draft's own refusal, such as recipe_serving_too_large.",
  inputSchema: z.strictObject({
    servings: servings.describe("How many servings the recipe makes, a whole number from 1 to 100."),
    lines: lines.describe(
      "The lines as create_recipe takes them. A counted line: counted true, foodId, amount as { grams } or { portionId, count } of one of the food's portions, written and note optional. A line not counted, such as salt: counted false and name.",
    ),
  }),
  run: (args, { service }) => previewRecipe(service, args),
});
