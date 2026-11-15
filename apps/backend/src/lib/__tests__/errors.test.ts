import { MAX_ENERGY_TARGET_KCAL, MAX_PROTEIN_TARGET_G } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { ERROR_MESSAGES } from "../errors.js";

describe("ERROR_MESSAGES", () => {
  it("states the target caps truly: every allowed value is below the numbers it names", () => {
    const message = ERROR_MESSAGES.target_value_invalid;
    const match = /below (\d+) for calories or (\d+) for protein/.exec(message);
    expect(match).not.toBeNull();
    const [energy, protein] = [Number(match![1]), Number(match![2])];
    expect(MAX_ENERGY_TARGET_KCAL).toBeLessThan(energy);
    expect(Math.round((MAX_ENERGY_TARGET_KCAL + 0.1) * 10) / 10).toBe(energy);
    expect(MAX_PROTEIN_TARGET_G).toBeLessThan(protein);
    expect(Math.round((MAX_PROTEIN_TARGET_G + 0.1) * 10) / 10).toBe(protein);
  });
});
