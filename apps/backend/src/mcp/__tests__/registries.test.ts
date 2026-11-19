import { describe, expect, it } from "@jest/globals";
import { READ_TOOLS } from "../tools/index.js";
import { WRITE_TOOLS } from "../tools/writes/index.js";

// Every key lists READ_TOOLS, and only a key that can write while writing is
// on lists WRITE_TOOLS (server.ts). So a write tool in READ_TOOLS would reach
// a read key. importBoundary.test.ts keeps the read registry's file from
// importing anything under tools/writes/. This checks the registries themselves.

/** A write tool carries what a read tool never does: its destructive mark and its replay reader. */
const isWriteTool = (tool: object) => "destructive" in tool || "replay" in tool;

describe("the tool registries", () => {
  it("hold the 12 read tools and the 18 write tools", () => {
    expect(READ_TOOLS).toHaveLength(12);
    expect(WRITE_TOOLS.map((tool) => tool.name)).toEqual([
      "log_food",
      "log_saved_meal",
      "log_estimate",
      "update_entry",
      "set_entries_status",
      "copy_entries",
      "remove_entries",
      "restore_entry",
      "create_own_food",
      "update_own_food",
      "add_portion",
      "update_portion",
      "set_favourite",
      "create_saved_meal",
      "update_saved_meal",
      "set_saved_meal_archived",
      "set_targets",
      "remove_targets",
    ]);
  });

  it("keep every write tool out of READ_TOOLS, by name and by kind", () => {
    const writeNames = new Set(WRITE_TOOLS.map((tool) => tool.name));
    expect(READ_TOOLS.filter((tool) => writeNames.has(tool.name)).map((tool) => tool.name)).toEqual([]);
    expect(READ_TOOLS.filter(isWriteTool).map((tool) => tool.name)).toEqual([]);
    expect(READ_TOOLS.filter((tool) => (WRITE_TOOLS as readonly object[]).includes(tool))).toEqual([]);
  });

  it("make every write tool a write tool, with a request key", () => {
    for (const tool of WRITE_TOOLS) {
      expect(isWriteTool(tool)).toBe(true);
      expect(Object.keys(tool.inputSchema.shape)).toContain("requestKey");
    }
  });

  it("give each tool one name across both", () => {
    const names = [...READ_TOOLS, ...WRITE_TOOLS].map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
