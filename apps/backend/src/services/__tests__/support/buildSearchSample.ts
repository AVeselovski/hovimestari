import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import * as schema from "../../../db/schema/index.js";
import { nearQuery, searchQuery, searchWords } from "../../foodSearch.js";

// Builds fixtures/fineli-names-r18.csv, the sample the search suites load:
//   DATABASE_URL=<a database that holds an imported release 18> \
//     pnpm --filter @hovimestari/backend search:sample [<out.csv>]
// It runs each search below through the service's own queries on the full
// release and keeps every food in a first 40, with the witnesses. No test runs
// it: the suites read the committed file and need no imported release. It
// works in one transaction and rolls it back, so the database is left as it
// was. fixtures/README.md says what the sample is and when to rebuild it.

/** How deep each search is kept. A position up to this in the sample is the position on the full release. */
const TOP = 40;

/** The searches read with Finnish names. */
const FINNISH = [
  "spagetti",
  "jauheliha 10 nauta",
  "nauta",
  "naudan",
  "jauheliha nauta",
  "sika",
  "sian",
  "lammas",
  "hirvi",
  "kanan",
  "perunan",
  "kana",
  "härän",
  "härkä",
  "naut",
  "rahka",
  "maito",
  "egg",
  "rice",
  "omena",
  "peruna",
  "kaura",
  "muna",
  "poro",
  "poron",
  "leipä",
  "ruisleipä",
  "mysli",
  "jaatelo",
  "rahka vl",
  "jäätelö kerma",
  "egg shell",
  "kananmuna kuoreton",
  "riisi tumma",
  "rahka maustettu",
];
/** The searches read with English names. */
const ENGLISH = ["soup", "kananmuna kuoreton"];
/** The searches read again with every recipe count empty, as on a database not imported since the counts came. */
const WITHOUT_COUNTS = ["spagetti", "maito", "kana"];

/** The foods the tests name that no first 40 is sure to hold. */
const WITNESSES = {
  /** Every food whose Finnish name starts with one of these. */
  startsWith: ["Spagettilihavuoka", "Kananmuna", "Poron", "Poro-", "Härän", "Mysli,", "Rahkapiirakka"],
  /** Every food typed FOOD whose Finnish name starts with one of these. */
  startsWithTypedFood: ["Porkkana"],
  /** Every food whose Finnish name holds one of these, in any case. */
  holds: ["härkäpapu"],
  /** The foods with exactly these Finnish names. */
  named: [
    "Munakoiso",
    "Maksa, poron",
    "Vaalea leipä, juustopatonki",
    // "leipä" past its first 40: a dish that starts with the word, a basic food and a dish with it inside a word.
    "Leipärasva, keskiarvo",
    "Jauho, hiivaleipävehnäjauho",
    "Voileipäkakku, kasvis",
  ],
  /** The foods with these Fineli ids. */
  ids: [153, 300, 362, 604, 622, 657, 750, 858, 8023],
};

const HEADER = "fineli_id;type;process;name;name_en;recipe_uses;recipe_foods";

/** The sample's text for the release 18 in the database `client` is connected to. It leaves the database as it was. */
async function sampleText(client: pg.Client): Promise<string> {
  const db = drizzle(client, { schema });
  const keep = new Set<string>();
  const run = async (userId: string, q: string) => {
    const words = await searchWords(db, q);
    for (const row of await searchQuery(db, userId, words, TOP)) keep.add(row.id);
    if (words.length >= 2) for (const row of await nearQuery(db, userId, words, TOP)) keep.add(row.id);
  };
  const reader = async (language: "fi" | "en") => {
    const { rows } = await client.query(
      "INSERT INTO users (email, google_id, food_name_language) VALUES ($1, $2, $3) RETURNING id",
      [`sample-${randomUUID()}@example.test`, `sample-${randomUUID()}`, language],
    );
    return rows[0].id as string;
  };

  await client.query("BEGIN");
  try {
    const finnish = await reader("fi");
    const english = await reader("en");
    for (const q of FINNISH) await run(finnish, q);
    for (const q of ENGLISH) await run(english, q);
    await client.query("UPDATE foods SET fineli_recipe_uses = 0, fineli_recipe_foods = NULL");
    for (const q of WITHOUT_COUNTS) await run(finnish, q);
  } finally {
    await client.query("ROLLBACK");
  }

  const prefixes = (list: string[]) => list.map((prefix) => `${prefix}%`);
  const witnesses = await client.query(
    `SELECT id FROM foods WHERE source = 'fineli' AND retired_at IS NULL AND (
       name LIKE ANY($1) OR (name LIKE ANY($2) AND fineli_type = 'FOOD') OR name ILIKE ANY($3)
       OR name = ANY($4) OR fineli_id = ANY($5))`,
    [
      prefixes(WITNESSES.startsWith),
      prefixes(WITNESSES.startsWithTypedFood),
      WITNESSES.holds.map((part) => `%${part}%`),
      WITNESSES.named,
      WITNESSES.ids,
    ],
  );
  for (const row of witnesses.rows) keep.add(row.id as string);

  const { rows } = await client.query(
    `SELECT fineli_id, fineli_type, fineli_process, name, name_en, fineli_recipe_uses, fineli_recipe_foods
     FROM foods WHERE id = ANY($1) ORDER BY fineli_id`,
    [[...keep]],
  );
  const lines = rows.map((r) => {
    const fields = [
      r.fineli_id,
      r.fineli_type,
      r.fineli_process,
      r.name,
      r.name_en ?? "",
      r.fineli_recipe_uses,
      r.fineli_recipe_foods ?? "",
    ].map(String);
    if (fields.some((field) => /[;\n]/.test(field))) throw new Error(`Food ${r.fineli_id} holds a separator.`);
    return fields.join(";");
  });
  return `${[HEADER, ...lines].join("\n")}\n`;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Name a database that holds an imported release 18.");
  process.exit(2);
}
const out = process.argv.slice(2).filter((arg) => arg !== "--")[0];
const target = out ?? fileURLToPath(new URL("../fixtures/fineli-names-r18.csv", import.meta.url));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const text = await sampleText(client);
  writeFileSync(target, text, "utf8");
  console.log(`Wrote ${text.trimEnd().split("\n").length - 1} foods to ${target}`);
} finally {
  await client.end();
}
