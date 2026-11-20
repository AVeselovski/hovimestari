import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import type { Client } from "@modelcontextprotocol/client";
import express from "express";
import { connect, keyMocks, listen, OTHER_KEY_EXPORTS, quietConsole, WRITE_KEY } from "./harness.js";

// Lifted from finanssiappisV2's writesOff.test.ts. MCP_WRITES_ENABLED=false,
// its default: a read-and-write key reads as a read key does and is offered
// no write tool. Set before the server and its env load. This file has its
// own module registry.
process.env.MCP_WRITES_ENABLED = "false";

quietConsole();
const keys = keyMocks();
jest.unstable_mockModule("../../db/index.js", () => ({ db: {} }));
jest.unstable_mockModule("../../lib/connectionKeys.js", () => ({ ...OTHER_KEY_EXPORTS, ...keys }));
// Mocked so a call that got past registration would show here, not as a database error.
type Fn = (...args: unknown[]) => Promise<unknown>;
const mocks = (...names: string[]) => Object.fromEntries(names.map((name) => [name, jest.fn<Fn>()]));
const recordedByFile = {
  entries: mocks(
    "recordedLogFood",
    "recordedLogSavedMeal",
    "recordedLogEstimate",
    "recordedUpdateEntry",
    "recordedSetEntriesStatus",
    "recordedCopyEntries",
    "recordedRemoveEntries",
    "recordedRestoreEntry",
    "replayEntry",
    "replayEntryChange",
    "replayEntryBatch",
    "replayCopies",
  ),
  foods: mocks(
    "recordedCreateOwnFood",
    "recordedUpdateOwnFood",
    "recordedAddPortion",
    "recordedUpdatePortion",
    "recordedSetFavourite",
    "replayFood",
    "replayPortion",
  ),
  savedMeals: mocks("recordedCreateSavedMeal", "recordedUpdateSavedMeal", "recordedSetSavedMealArchived", "replayMeal"),
  targets: mocks("recordedSetTargets", "recordedRemoveTargets", "replayTargets"),
  recipes: mocks(
    "recordedCreateRecipe",
    "recordedUpdateRecipe",
    "recordedSetRecipeArchived",
    "recordedSetRecipeFavourite",
    "replayRecipe",
  ),
};
jest.unstable_mockModule("../../services/writes/recorded/entries.js", () => recordedByFile.entries);
jest.unstable_mockModule("../../services/writes/recorded/foods.js", () => recordedByFile.foods);
jest.unstable_mockModule("../../services/writes/recorded/savedMeals.js", () => recordedByFile.savedMeals);
jest.unstable_mockModule("../../services/writes/recorded/targets.js", () => recordedByFile.targets);
jest.unstable_mockModule("../../services/writes/recorded/recipes.js", () => recordedByFile.recipes);
const recorded = Object.assign({}, ...Object.values(recordedByFile)) as Record<string, ReturnType<typeof jest.fn>>;
const findReplay = jest.fn<Fn>(async () => null);
jest.unstable_mockModule("../../services/writes/changeRecord.js", () => ({
  findReplay,
  countRecentChanges: jest.fn(async () => 0),
  replayAfterConflict: jest.fn(),
  requestHashOf: jest.fn(() => "hash"),
  RequestKeyTaken: class extends Error {},
}));
// What get_context reads, so its access and rules can be checked.
jest.unstable_mockModule("../../services/reads/targets.js", () => ({
  targetChangeOf: jest.fn(),
  targetsOn: jest.fn(),
  inForceOn: jest.fn(),
  listTargetChanges: jest.fn(),
  targetsOverview: jest.fn(async () => ({ inForce: null, changes: [] })),
}));

const { mcpRouter } = await import("../router.js");
const { APP_RULES } = await import("../appRules.js");
const { READ_TOOLS } = await import("../tools/index.js");
const { WRITE_TOOLS } = await import("../tools/writes/index.js");

const app = express();
app.use("/mcp", mcpRouter);

let server: Awaited<ReturnType<typeof listen>>;
let writer: Client;

beforeAll(async () => {
  server = await listen(app);
  writer = await connect(server.url, WRITE_KEY);
});
afterAll(async () => {
  await writer.close();
  await server.close();
});

describe("MCP_WRITES_ENABLED=false", () => {
  it("lists only the read tools to a read-and-write key", async () => {
    const names = (await writer.listTools()).tools.map((t) => t.name);
    expect(names).toEqual(READ_TOOLS.map((t) => t.name));
    expect(names).toHaveLength(15);
  });

  it("refuses a direct call of every write tool, and never reaches a recorded write or the record", async () => {
    expect(WRITE_TOOLS).toHaveLength(22);
    for (const tool of WRITE_TOOLS) {
      const result = await writer
        .callTool({ name: tool.name, arguments: { requestKey: "k7Qx2mPa9w" } })
        .catch((e: unknown) => e);
      const said =
        result instanceof Error ? result.message : (result as { content: { text: string }[] }).content[0].text;
      expect(said).toContain(`Tool ${tool.name} not found`);
    }
    for (const mock of Object.values(recorded)) expect(mock).not.toHaveBeenCalled();
    expect(findReplay).not.toHaveBeenCalled();
  });

  it("tells the model that changes are switched off", () => {
    expect(writer.getInstructions()).toContain("read-only");
    expect(writer.getInstructions()).toContain("Changes are switched off in the app for now.");
  });

  it("tells get_context the key cannot write, with the read rules only", async () => {
    const result = (await writer.callTool({ name: "get_context", arguments: {} })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(result.isError).toBeFalsy();
    const { data } = JSON.parse(result.content[0].text);
    expect(data.access).toMatchObject({ canWrite: false });
    expect(data.rules).toBe(APP_RULES);
  });

  it("serves the read rules only", async () => {
    const resource = await writer.readResource({ uri: "hovimestari://app-rules" });
    expect((resource.contents[0] as { text: string }).text).toBe(APP_RULES);
  });
});
