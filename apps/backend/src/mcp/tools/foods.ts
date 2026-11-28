import { BarcodeSchema, FoodListQuerySchema, FoodSearchQuerySchema, RecentsQuerySchema } from "@hovimestari/types";
import { z } from "zod";
import { getFood, listFavouriteFoods, listOwnFoods, searchFoods } from "../../services/reads/foods.js";
import { listRecents } from "../../services/reads/log.js";
// The one write service a read tool calls: a lookup keeps a public product and
// makes it visible to the person, so it turns up in their search from then on,
// and changes none of their data (design d.3). Hence readOnlyHint stays true,
// and the description says plainly what the lookup keeps.
import { lookupBarcode, sharedLookupDeps } from "../../services/writes/barcode.js";
import { defineTool } from "../result.js";

// Foods, recent items and the barcode lookup (design d.3), through the
// services GET /foods/search, /foods/:id, /foods/favourites, /foods/own,
// /log/recents and POST /foods/lookup call, with the routes' own query
// schemas. Each answers the route's own fields.

const { q, limit: searchLimit } = FoodSearchQuerySchema.shape;
const { limit: listLimit } = FoodListQuerySchema.shape;
const { limit: recentsLimit } = RecentsQuerySchema.shape;

export const searchFoodsTool = defineTool({
  name: "search_foods",
  description:
    "Foods whose Finnish or English name holds every word of q. Among foods that match as strongly, basic foods come before dishes. Within each of the two, the person's favourites, own foods and scanned products come first, and then, among basic foods, one that more of Fineli's recipes use. For meats and a few staples, a Finnish base form also finds its genitive and the reverse, such as nauta and naudan. near lists up to 8 foods that hold all words but one, when q has two words or more and few foods hold them all: fewer than 8, or fewer than limit when limit is under 8. Each with its source and its figures per 100 g.",
  inputSchema: z.strictObject({
    q: q.describe("The words to find, 1 to 100 characters."),
    limit: searchLimit.describe("At most this many foods, 1 to 50."),
  }),
  run: (args, { service }) => searchFoods(service, args),
});

export const getFoodTool = defineTool({
  name: "get_food",
  description:
    "One food: its figures per 100 g, its source, its barcode, its portions, whether it is a favourite, and the amount the person last ate of it.",
  inputSchema: z.strictObject({ foodId: z.uuid().describe("The food's id, from search_foods or another list.") }),
  run: ({ foodId }, { service }) => getFood(service, foodId),
});

export const listFavouriteFoodsTool = defineTool({
  name: "list_favourite_foods",
  description:
    "The person's favourite foods, the newest favourite first, each with the amount the person last ate of it.",
  inputSchema: z.strictObject({ limit: listLimit.describe("At most this many foods, 1 to 200.") }),
  run: (args, { service }) => listFavouriteFoods(service, args),
});

export const listOwnFoodsTool = defineTool({
  name: "list_own_foods",
  description: "The person's own foods, typed from a label, in alphabetical order.",
  inputSchema: z.strictObject({ limit: listLimit.describe("At most this many foods, 1 to 200.") }),
  run: (args, { service }) => listOwnFoods(service, args),
});

export const listRecentItemsTool = defineTool({
  name: "list_recent_items",
  description:
    "What the person ate lately, foods, saved meals and recipes, the most recent first, each once, with the amount of the last time: grams and a portion for a food, a count for a meal, servings for a recipe. An entry from a batch counts as its recipe. Archived and deleted meals and recipes are left out.",
  inputSchema: z.strictObject({ limit: recentsLimit.describe("At most this many items, 1 to 30.") }),
  async run(args, { service }) {
    return { items: await listRecents(service, args) };
  },
});

export const lookUpBarcodeTool = defineTool({
  name: "look_up_barcode",
  description:
    "Looks up a product barcode: the person's own foods first, then Open Food Facts. Answers found with the food, incomplete with the values the product has, not_found, in_store for a shop's own code that can change with the weight or the price, or wrong_digits for digits no barcode has, which is never sent. Each call to Open Food Facts spends the person's own lookup budget, about 30 an hour, shared with their scans in the app. A product found on Open Food Facts is kept, and from then on the person finds it in their food search: newlyVisible is true when this lookup did that. It changes none of the person's data.",
  inputSchema: z.strictObject({ barcode: BarcodeSchema.describe("The barcode's 8 to 14 digits. Spaces are dropped.") }),
  annotations: { openWorldHint: true },
  async run(args, { service }) {
    return (await lookupBarcode(service, args, sharedLookupDeps())).value;
  },
});
