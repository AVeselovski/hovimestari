import { BarcodeLookupSchema, FINELI_PORTION_UNITS, FOOD_SOURCES } from "@hovimestari/types";
import { describe, expect, it } from "@jest/globals";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP_RULES, APP_RULES_SOURCES, appRulesFor, WRITE_RULES } from "../appRules.js";
import { READ_TOOLS } from "../tools/index.js";
import { WRITE_TOOLS } from "../tools/writes/index.js";

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

/** Every snake_case word in `text`: a tool name, or a value such as a food's source. */
const snakeCaseWords = (text: string): string[] => [...new Set(text.match(/\b[a-z]+(?:_[a-z]+)+\b/g) ?? [])].sort();
/** The snake_case words the rules may use that name no tool: the values of a food's source and of a lookup's answer. */
const FIELD_VALUES: readonly string[] = [
  ...FOOD_SOURCES,
  ...BarcodeLookupSchema.options.map((answer) => answer.shape.result.value),
].filter((value) => value.includes("_"));

const DISCLAIMER = "Nothing the app returns is nutrition or medical advice.";
const ADVICE_WORDS = /you should|recommend|advice|healthy|too much|too little|on track/;

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
    const said = APP_RULES.match(/changes (nothing|none of)/g) ?? [];
    const saidOfReadOnly = APP_RULES.match(/A read-only connection changes none of the person's data/g) ?? [];
    expect(said.length).toBe(saidOfReadOnly.length);
    expect(saidOfReadOnly).toHaveLength(1);
  });

  it("names no write tool in the rules a read key reads", () => {
    const writeNames = WRITE_TOOLS.map((tool) => tool.name);
    expect(writeNames.filter((name) => APP_RULES.includes(name))).toEqual([]);
    // The write rules do lean on write tools, read from the registry.
    expect(snakeCaseWords(WRITE_RULES).filter((word) => writeNames.includes(word))).toEqual(
      expect.arrayContaining(["create_own_food", "log_estimate", "set_entries_status", "update_entry"]),
    );
  });

  it("names only tools a read key lists", () => {
    const named = snakeCaseWords(appRulesFor(false));
    const listed = READ_TOOLS.map((tool) => tool.name);
    expect(named.filter((word) => !listed.includes(word) && !FIELD_VALUES.includes(word))).toEqual([]);
    // The words are really read: the tools the rules lean on are among them, and no value is a tool's name.
    expect(named).toEqual(expect.arrayContaining(["get_context", "get_day", "get_days", "search_foods"]));
    expect(FIELD_VALUES.filter((value) => listed.includes(value))).toEqual([]);
  });

  it("names only tools a writing key lists", () => {
    const named = snakeCaseWords(appRulesFor(true));
    const listed = [...READ_TOOLS, ...WRITE_TOOLS].map((tool) => tool.name);
    expect(named.filter((word) => !listed.includes(word) && !FIELD_VALUES.includes(word))).toEqual([]);
    expect(named).toEqual(expect.arrayContaining(["log_estimate", "set_entries_status", "update_entry"]));
  });

  it("says the person can read every change in Settings, where the record's screen is", () => {
    expect(WRITE_RULES).toContain(
      "7. Everything you change is recorded in the app under this connection's name, and the person can read it in Settings.",
    );
  });

  it("names every kind of change a writing key can make, and sets targets only with the person's numbers", () => {
    expect(WRITE_RULES).toContain(
      "add and change the person's own foods and portions, mark favourites, save, change and archive saved meals, create, change, tag and archive recipes, mark them as favourites, log them and log a batch as made, and change targets.",
    );
    expect(WRITE_RULES).toContain("Values the person reads from a label go in with create_own_food.");
    expect(WRITE_RULES).toContain("Set them only with the numbers the person gave, from the date they gave");
    expect(WRITE_RULES).not.toContain("does not change them");
  });

  it("says a retry after a limit is safe with the same request key, as the refusal says", () => {
    expect(WRITE_RULES).toContain(
      "wait as it says, then retry with the same requestKey. A change that already landed is not made twice.",
    );
  });

  it("names no deletion tool while no tool can delete", () => {
    expect(`${APP_RULES}${WRITE_RULES}`).not.toContain("request_deletion");
    expect(WRITE_RULES).toContain("This connection cannot delete foods, saved meals or recipes.");
  });

  it("never reads as leave to change anything the person did not ask for", () => {
    // Removing entries skips a deletion request, not the person's yes.
    for (const phrase of ["needs no approval", "without asking", "no need to ask"]) {
      expect(WRITE_RULES.toLowerCase()).not.toContain(phrase);
    }
    expect(WRITE_RULES).toContain("Like every change, remove entries only when the person has asked for it.");
  });

  it("tells the assistant to quote a recipe's figures, and to enter a recipe from its foods through a preview", () => {
    expect(APP_RULES).toContain("Quote them, never add up the lines yourself.");
    expect(WRITE_RULES).toContain("never for a food you could not find");
    expect(WRITE_RULES).toContain(
      "Call preview_recipe, show each line's food and grams and the figures per serving from its answer, and create on their yes.",
    );
    expect(WRITE_RULES).toContain("A refusal names its line by index.");
  });

  it("says a recipe on a day keeps its figures, and only planned entries from today on follow an edit", () => {
    expect(APP_RULES).toContain("A recipe on a day is an entry of kind recipe with a number of servings");
    expect(APP_RULES).toContain("changes its planned entries from today on, as with a saved meal.");
    expect(APP_RULES).toContain("lastPutOn is the latest date the recipe is on, planned or eaten.");
    expect(APP_RULES).not.toContain("cannot be put on a day");
  });

  it("says a cook's entries keep the cook's figures, and asks for a batch as made through log_cook with fromLineId", () => {
    expect(APP_RULES).toContain("Editing a food or the recipe does not change a cook or its entries.");
    expect(APP_RULES).toContain("A copy of an entry from a cook plans its recipe again");
    expect(WRITE_RULES).toContain("Log a batch that came out different with log_cook, never by editing the recipe.");
    expect(WRITE_RULES).toContain("Give each line from the recipe its fromLineId from get_recipe");
  });

  it("names every Fineli portion unit in the foods section, so an assistant can name a copied portion", () => {
    const foods = APP_RULES.slice(APP_RULES.indexOf("## 5. Foods"), APP_RULES.indexOf("## 6."));
    const units = foods.match(/A Fineli portion has a unit code: ([^.]*)\./)?.[1] ?? "";
    // Every unit, none stale, in the order a food's detail lists them. Their
    // English labels live only in the web catalog (foods.portionUnits).
    expect(units.split(", ").map((named) => named.split(" ")[0])).toEqual([...FINELI_PORTION_UNITS]);
    expect(foods).toContain("A food copied into the person's own is a new own food");
    expect(WRITE_RULES).toContain("So does a copy of a food, with the person's changes.");
  });

  it("gives a read key the estimate rule too", () => {
    expect(APP_RULES).toContain("A figure judged from a photo or a description is an estimate");
  });

  it("tells the assistant to quote figures and never to fill a day without targets", () => {
    expect(APP_RULES).toContain("Quote the figures the tools return and do not rebuild a total from entries");
    expect(APP_RULES).toContain("Never fill a day without targets with a nearby change's numbers");
    expect(APP_RULES).toContain("Planned is not eaten.");
  });

  it("says how to read a past day with nothing recorded, and that today and later days keep their positions", () => {
    expect(APP_RULES).toContain("On a past day, a reading that holds no entries has no position either");
    expect(APP_RULES).toContain("never quote its zero as what the person ate");
    expect(APP_RULES).toContain("On today and later days an empty reading keeps its position");
  });

  it("says how to read a range's average day, and never to average days itself", () => {
    expect(APP_RULES).toContain("and answers the average day over them");
    expect(APP_RULES).toContain("today and planned days included. Today counts toward eaten only once it is over.");
    expect(APP_RULES).toContain(
      "A day counts whole however little is on it, and a day with no entries counts toward neither.",
    );
    expect(APP_RULES).toContain("An average has a position only when every day it counts has the same targets");
    expect(APP_RULES).toContain("Never average or add up days yourself.");
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
