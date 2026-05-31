import { describe, it, expect } from "vitest";
import { recipeFromImageTask } from "./recipe-from-image.js";

describe("recipeFromImageTask prompt", () => {
  it("builds a system + user message pair", () => {
    const task = recipeFromImageTask();
    expect(task.messages).toHaveLength(2);
    expect(task.messages[0].role).toBe("system");
    expect(task.messages[1].role).toBe("user");
  });

  it("system prompt mentions photograph/OCR modality preamble", () => {
    const task = recipeFromImageTask();
    const sys = task.messages[0].content;
    expect(sys.toLowerCase()).toContain("photograph");
    expect(sys.toLowerCase()).toContain("ocr");
  });

  it("reuses the recipe_draft response schema with vision-friendly options", () => {
    const task = recipeFromImageTask();
    expect(task.opts?.responseSchema?.name).toBe("recipe_draft");
    expect(task.opts?.responseSchema?.schema).toBeDefined();
    expect(task.opts?.maxTokens).toBe(4096);
    expect(task.opts?.temperature).toBeLessThanOrEqual(0.2);
  });
});

describe("recipeFromImageTask.parse", () => {
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
    const task = recipeFromImageTask();
    const result = task.parse(goodJson);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe("Jauheliha-tomaattipasta");
    expect(result.value.ingredients).toHaveLength(2);
    expect(result.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("rejects invalid JSON", () => {
    const task = recipeFromImageTask();
    const result = task.parse("not json {");
    expect(result.ok).toBe(false);
  });

  it("returns the empty-ingredients warning and low confidence when ingredients are missing", () => {
    const task = recipeFromImageTask();
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
    expect(result.warnings.some((w) => w.toLowerCase().includes("ainek"))).toBe(
      true,
    );
  });

  it("strips markdown fences before parsing", () => {
    const task = recipeFromImageTask();
    const wrapped = "```json\n" + goodJson + "\n```";
    const result = task.parse(wrapped);
    expect(result.ok).toBe(true);
  });
});
