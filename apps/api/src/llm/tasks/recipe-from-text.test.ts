import { describe, it, expect } from "vitest";
import {
  recipeFromTextTask,
  stripJsonFences,
  computeConfidence,
  RECIPE_DRAFT_JSON_SCHEMA,
} from "./recipe-from-text.js";

describe("recipeFromTextTask prompt", () => {
  it("builds a system + user message pair", () => {
    const task = recipeFromTextTask("Jauhelihapasta 20 min");
    expect(task.messages).toHaveLength(2);
    expect(task.messages[0].role).toBe("system");
    expect(task.messages[1].role).toBe("user");
    expect(task.messages[1].content).toBe("Jauhelihapasta 20 min");
  });

  it("system prompt enumerates the eight aisle categories", () => {
    const task = recipeFromTextTask("x");
    const sys = task.messages[0].content;
    for (const cat of [
      "produce",
      "bakery",
      "meat-fish",
      "dairy",
      "frozen",
      "pantry",
      "drinks",
      "other",
    ]) {
      expect(sys).toContain(cat);
    }
  });

  it("requests a json_schema response format and low temperature", () => {
    const task = recipeFromTextTask("x");
    expect(task.opts?.responseSchema?.name).toBe("recipe_draft");
    expect(task.opts?.responseSchema?.schema).toBeDefined();
    expect(task.opts?.temperature).toBeLessThanOrEqual(0.2);
  });

  it("instructs the model to emit numeric (or null) amounts", () => {
    const task = recipeFromTextTask("x");
    const sys = task.messages[0].content;
    expect(sys).toMatch(/number/i);
    expect(sys).toMatch(/null/i);
  });

  it("declares amount as number-or-null in the JSON schema", () => {
    const ingProps = (
      RECIPE_DRAFT_JSON_SCHEMA as {
        properties: {
          ingredients: {
            items: { properties: { amount: { type: string[] | string } } };
          };
        };
      }
    ).properties.ingredients.items.properties.amount;
    expect(ingProps.type).toEqual(["number", "null"]);
  });
});

describe("recipeFromTextTask.parse", () => {
  const goodJson = JSON.stringify({
    name: "Jauheliha-tomaattipasta",
    time: 20,
    servings: 4,
    category: "common",
    ingredients: [
      { name: "Naudan jauheliha", amount: 400, unit: "g", category: "meat-fish" },
      { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
    ],
  });

  it("validates a well-formed response", () => {
    const task = recipeFromTextTask("source text 20 min");
    const result = task.parse(goodJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Jauheliha-tomaattipasta");
    expect(result.value.ingredients).toHaveLength(2);
    expect(result.value.ingredients[0].amount).toBe(400);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("accepts a null amount as the explicit 'no quantity' sentinel", () => {
    const task = recipeFromTextTask("Pasta, ripaus suolaa");
    const result = task.parse(
      JSON.stringify({
        name: "Pasta",
        time: 20,
        servings: 4,
        category: "common",
        ingredients: [
          { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
          { name: "Suolaa", amount: null, unit: "ripaus", category: "pantry" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ingredients[1].amount).toBeNull();
  });

  it("rejects invalid JSON", () => {
    const task = recipeFromTextTask("x");
    const result = task.parse("not json {");
    expect(result.ok).toBe(false);
  });

  it("rejects schema mismatches", () => {
    const task = recipeFromTextTask("x");
    const result = task.parse(
      JSON.stringify({
        name: "x",
        time: 10,
        servings: 4,
        category: "common",
        ingredients: [{ name: "a", amount: 1, unit: "g", category: "not-a-category" }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("strips markdown JSON fences before parsing", () => {
    const task = recipeFromTextTask("x");
    const wrapped = "```json\n" + goodJson + "\n```";
    const result = task.parse(wrapped);
    expect(result.ok).toBe(true);
  });

  it("applies defaults and emits Finnish warnings when fields are missing", () => {
    const task = recipeFromTextTask("Jauhelihapasta");
    const result = task.parse(
      JSON.stringify({
        name: "Jauhelihapasta",
        ingredients: [
          { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.servings).toBe(4);
    expect(result.value.time).toBe(30);
    expect(result.value.category).toBe("common");
    expect(result.warnings.some((w) => w.includes("Annoskoko"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Valmistusaika"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("Kategoria"))).toBe(true);
  });

  it("reports low confidence and a warning when ingredients are empty", () => {
    const task = recipeFromTextTask("Pasta on hyvä");
    const result = task.parse(
      JSON.stringify({
        name: "Pasta",
        time: 20,
        servings: 4,
        category: "common",
        ingredients: [],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.warnings.some((w) => w.toLowerCase().includes("ainek"))).toBe(true);
  });
});

describe("recipeFromTextTask instructions", () => {
  it("includes instructions in the JSON schema but not as required", () => {
    const props = (
      RECIPE_DRAFT_JSON_SCHEMA as {
        properties: Record<string, unknown>;
        required: string[];
      }
    );
    expect(props.properties.instructions).toEqual({
      type: "array",
      items: { type: "string" },
    });
    expect(props.required).not.toContain("instructions");
  });

  it("defaults instructions to [] when absent in the response", () => {
    const task = recipeFromTextTask("x");
    const result = task.parse(
      JSON.stringify({
        name: "Pasta",
        time: 20,
        servings: 4,
        category: "common",
        ingredients: [
          { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.instructions).toEqual([]);
  });

  it("round-trips a non-empty instructions array", () => {
    const task = recipeFromTextTask("x");
    const steps = ["Keitä pasta.", "Paista jauheliha.", "Sekoita kastike."];
    const result = task.parse(
      JSON.stringify({
        name: "Jauhelihapasta",
        time: 20,
        servings: 4,
        category: "common",
        ingredients: [
          { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
        ],
        instructions: steps,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.instructions).toEqual(steps);
  });
});

describe("stripJsonFences", () => {
  it("removes ```json prefix and trailing ``` ", () => {
    expect(stripJsonFences("```json\n{\"a\":1}\n```")).toBe('{"a":1}');
  });
  it("removes bare ``` fences", () => {
    expect(stripJsonFences("```\n{\"a\":1}\n```")).toBe('{"a":1}');
  });
  it("leaves unfenced text untouched", () => {
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}');
  });
});

describe("computeConfidence", () => {
  it("starts at 1.0 for a complete draft", () => {
    const { confidence, warnings } = computeConfidence(
      {
        name: "Pasta",
        time: 20,
        servings: 4,
        category: "common",
        ingredients: [
          { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
        ],
        instructions: [],
      },
      "Pasta 20 min, 400 g pastaa",
    );
    expect(confidence).toBe(1);
    expect(warnings).toEqual([]);
  });

  it("treats amount: 0 as a real amount (no penalty)", () => {
    const { confidence, warnings } = computeConfidence(
      {
        name: "Pasta",
        time: 20,
        servings: 4,
        category: "common",
        ingredients: [
          { name: "Pasta", amount: 0, unit: "g", category: "pantry" },
        ],
        instructions: [],
      },
      "Pasta 20 min",
    );
    expect(confidence).toBe(1);
    expect(warnings).toEqual([]);
  });

  it("caps the missing-amount penalty at 0.4", () => {
    const { confidence } = computeConfidence(
      {
        name: "x",
        time: 20,
        servings: 4,
        category: "common",
        ingredients: [
          { name: "a", amount: null, unit: "g", category: "pantry" },
          { name: "b", amount: null, unit: "g", category: "pantry" },
          { name: "c", amount: null, unit: "g", category: "pantry" },
          { name: "d", amount: null, unit: "g", category: "pantry" },
        ],
        instructions: [],
      },
      "abcd",
    );
    expect(confidence).toBeCloseTo(0.6, 5);
  });
});
