import {
  MAX_NEW_FOOD_PORTIONS,
  OwnFoodBodySchema,
  OwnFoodUpdateBodySchema,
  PortionBodySchema,
} from "@hovimestari/types";
import { z } from "zod";
import {
  recordedAddPortion,
  recordedCreateOwnFood,
  recordedSetFavourite,
  recordedUpdateOwnFood,
  recordedUpdatePortion,
  replayFood,
  replayPortion,
} from "../../../services/writes/recorded/foods.js";
import { writeInput } from "../../inputs.js";
import { defineWriteTool } from "./run.js";

// The food write tools (design d.3), each through one recorded service in
// services/writes/recorded/foods.ts, which calls the service its REST route
// calls. Field names are the REST body's. Only the person's own foods can be
// created or edited: a shared food answers food_read_only, as on screen. A
// portion or a favourite may go on any food the person can see.

const FoodId = z.uuid().describe("The food's id, from search_foods, get_food or a list of foods.");
const OwnFoodId = z.uuid().describe("The id of one of the person's own foods, from list_own_foods or get_food.");
const Name = OwnFoodBodySchema.shape.name.describe("The food's name, as on its label or in the person's words.");
const Per100g = OwnFoodBodySchema.shape.per100g.describe(
  "energyKcal, proteinG, carbsG and fatG per 100 g, as the label states them.",
);
const Barcode = OwnFoodBodySchema.shape.barcode.describe(
  "The label's barcode, 8, 12, 13 or 14 digits whose last digit checks out. Spaces are dropped.",
);
const PortionName = PortionBodySchema.shape.name.describe("The portion's name, such as slice or tub.");
const PortionGrams = PortionBodySchema.shape.grams.describe("How many grams one portion weighs, as stated.");
// The create body's portions, each field described as add_portion describes it.
const NewFoodPortions = z
  .array(z.object({ name: PortionName, grams: PortionGrams }))
  .max(MAX_NEW_FOOD_PORTIONS, { error: "portions_too_many" })
  .optional()
  .describe(
    "Portions the food comes with, such as those of a food you copy. At most 30. A Fineli portion has a unit code and no name: give it a name the person reads, such as Tablespoon for RKL.",
  );

export const createOwnFoodTool = defineWriteTool({
  name: "create_own_food",
  description:
    "Add one of the person's own foods, with the values per 100 g from its label, and optionally its barcode and portions. To make a food from Fineli or Open Food Facts the person's own with their changes, read it with get_food and pass its name, values and portions, changed as the person asks. The food copied stays as it is. A food with a barcode is what the person's next lookup of that barcode finds. It is then found by search_foods and can be logged with log_food. Answers the food with its id.",
  inputSchema: writeInput({ name: Name, per100g: Per100g, barcode: Barcode, portions: NewFoodPortions }),
  destructive: false,
  async run(args, { service, via }) {
    const { outcome, value } = await recordedCreateOwnFood(service, via, args);
    return { outcome, data: { food: value } };
  },
  replay: replayFood,
});

export const updateOwnFoodTool = defineWriteTool({
  name: "update_own_food",
  description:
    "Change one of the person's own foods, given whole, as the edit form saves it: its name, its values per 100 g and its barcode. A barcode left out is removed. Its planned entries from today on take the new values, and every other entry keeps the values it was added with.",
  inputSchema: writeInput({
    foodId: OwnFoodId,
    name: OwnFoodUpdateBodySchema.shape.name.describe("The food's name."),
    per100g: Per100g,
    barcode: OwnFoodUpdateBodySchema.shape.barcode.describe(
      "The food's barcode, or null for none. Left out, the food has none. A new or changed barcode must be 8, 12, 13 or 14 digits whose last digit checks out.",
    ),
  }),
  destructive: true,
  async run({ foodId, ...food }, { service, via }) {
    const { outcome, value } = await recordedUpdateOwnFood(service, via, foodId, food);
    return { outcome, data: { food: value } };
  },
  replay: replayFood,
});

export const addPortionTool = defineWriteTool({
  name: "add_portion",
  description:
    "Add a portion of the person's own to a food they can see: a name and the grams it weighs, so the food can be logged by a count of it. Only this person sees it.",
  inputSchema: writeInput({ foodId: FoodId, name: PortionName, grams: PortionGrams }),
  destructive: false,
  async run({ foodId, ...portion }, { service, via }) {
    const { outcome, value } = await recordedAddPortion(service, via, foodId, portion);
    return { outcome, data: { portion: value } };
  },
  replay: replayPortion,
});

export const updatePortionTool = defineWriteTool({
  name: "update_portion",
  description:
    "Change the name and grams of one of the person's own portions. Portions that come with a food's source cannot be changed. Entries already logged keep their grams.",
  inputSchema: writeInput({
    foodId: FoodId,
    portionId: z.uuid().describe("The portion's id, from get_food."),
    name: PortionName,
    grams: PortionGrams,
  }),
  destructive: true,
  async run({ foodId, portionId, ...portion }, { service, via }) {
    const { outcome, value } = await recordedUpdatePortion(service, via, foodId, portionId, portion);
    return { outcome, data: { portion: value } };
  },
  replay: replayPortion,
});

export const setFavouriteTool = defineWriteTool({
  name: "set_favourite",
  description:
    "Mark a food the person can see as a favourite, or take it off their favourites. Favourites rank first in search_foods.",
  inputSchema: writeInput({
    foodId: FoodId,
    favourite: z.boolean().describe("true to mark it, false to take it off."),
  }),
  destructive: false,
  async run({ foodId, favourite }, { service, via }) {
    const { outcome } = await recordedSetFavourite(service, via, foodId, favourite);
    return { outcome, data: {} };
  },
  replay: replayFood,
});
