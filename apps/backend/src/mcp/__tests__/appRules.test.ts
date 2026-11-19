import { describe, expect, it } from "@jest/globals";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP_RULES, APP_RULES_SOURCES, appRulesFor, WRITE_RULES } from "../appRules.js";

// Lifted from finanssiappisV2, with Hovimestari's phrases. The app rules are
// hand-written from docs/features/*.md (design d.6): a base text every key
// reads, and the write rules a key that can write reads after it. These
// checks keep both in step: every feature doc has a stamp, every stamp is the
// doc's current hash, every doc is named by a section, each text fits a
// model's budget, and neither slides into advice or a verdict on a day.

const DOCS = fileURLToPath(new URL("../../../../../docs/", import.meta.url));
const featureFiles = readdirSync(`${DOCS}features`)
  .filter((f) => f.endsWith(".md"))
  .sort();
const ADD_STAMP =
  "Add a stamp to APP_RULES_SOURCES in apps/backend/src/mcp/appRules.ts and name the file in a section's Sources line.";
const catalogLinks = [...readFileSync(`${DOCS}features.md`, "utf8").matchAll(/\]\(features\/([a-z0-9-]+\.md)\)/g)]
  .map((m) => m[1])
  .sort();

const DISCLAIMER = "Nothing the app returns is nutrition or medical advice.";
const ADVICE_WORDS = /you should|recommend|advice|healthy|too much|too little|on track/;

/**
 * The write tools the write rules name. No write tool is registered yet:
 * the slice that adds the write tools reads these names from their registry
 * instead, so a new tool is covered without editing this test.
 */
const WRITE_TOOLS_NAMED = ["log_estimate", "set_entries_status", "update_entry", "create_own_food"];

describe("APP_RULES", () => {
  it("has a stamp for exactly the feature docs that exist and the catalog lists", () => {
    const stamped = Object.keys(APP_RULES_SOURCES).sort();
    const unstamped = featureFiles.filter((file) => !stamped.includes(file));
    if (unstamped.length > 0) {
      throw new Error(`The app rules have no stamp for docs/features/{${unstamped.join(", ")}}. ${ADD_STAMP}`);
    }
    expect(stamped).toEqual(featureFiles);
    expect(stamped).toEqual([...new Set(catalogLinks)]);
  });

  it.each(featureFiles)("was reviewed against the current docs/features/%s", (file) => {
    const hash = createHash("sha256")
      .update(readFileSync(`${DOCS}features/${file}`))
      .digest("hex");
    if (APP_RULES_SOURCES[file] !== hash) {
      throw new Error(
        `docs/features/${file} changed since the app rules were last reviewed. Re-read it, update the matching ` +
          `section of APP_RULES in apps/backend/src/mcp/appRules.ts if the rules changed, then set its stamp to ${hash}.`,
      );
    }
  });

  it.each(featureFiles)("names %s in a section's sources line", (file) => {
    const sourceLines = [...`${APP_RULES}${WRITE_RULES}`.matchAll(/^\*\(Sources: ([^)]*)\)\*$/gm)].map((m) =>
      m[1].split(", "),
    );
    if (!sourceLines.flat().includes(file)) {
      throw new Error(`No section of APP_RULES names ${file} in its Sources line. ${ADD_STAMP}`);
    }
  });

  it("stays within the size a model reads every session", () => {
    expect(APP_RULES.length).toBeLessThanOrEqual(12_000);
    expect(WRITE_RULES.length).toBeLessThanOrEqual(3_500);
  });

  it("does not advise or judge, apart from the one sentence that says it does not advise", () => {
    expect(APP_RULES.split(DISCLAIMER)).toHaveLength(2);
    expect(WRITE_RULES).not.toContain(DISCLAIMER);
    const rest = `${APP_RULES}${WRITE_RULES}`.replace(DISCLAIMER, "").toLowerCase();
    expect(rest).not.toMatch(ADVICE_WORDS);
  });

  it("never tells every connection that it changes nothing", () => {
    const said = APP_RULES.match(/changes nothing/g) ?? [];
    const saidOfReadOnly = APP_RULES.match(/A read-only connection changes nothing/g) ?? [];
    expect(said.length).toBe(saidOfReadOnly.length);
    expect(saidOfReadOnly).toHaveLength(1);
  });

  it("names every write tool in the write rules only", () => {
    for (const tool of WRITE_TOOLS_NAMED) {
      expect(WRITE_RULES).toContain(tool);
      expect(APP_RULES).not.toContain(tool);
    }
  });

  it("names no deletion tool while no tool can delete", () => {
    expect(`${APP_RULES}${WRITE_RULES}`).not.toContain("request_deletion");
    expect(WRITE_RULES).toContain("This connection cannot delete foods or saved meals.");
  });

  it("gives a read key the estimate rule too", () => {
    expect(APP_RULES).toContain("A figure judged from a photo or a description is an estimate");
  });

  it("tells the assistant to quote figures and never to fill a day without targets", () => {
    expect(APP_RULES).toContain("Quote the figures the tools return and do not rebuild a total from entries");
    expect(APP_RULES).toContain("Never fill a day without targets with a nearby change's numbers");
    expect(APP_RULES).toContain("Planned is not eaten.");
  });
});

describe("appRulesFor", () => {
  it("is the base text for a connection that cannot write", () => {
    expect(appRulesFor(false)).toBe(APP_RULES);
  });

  it("adds the write rules after the base text for one that can", () => {
    expect(appRulesFor(true)).toBe(`${APP_RULES}\n${WRITE_RULES}`);
  });
});
