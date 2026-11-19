import { describe, expect, it } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { importsOf } from "../../__tests__/support/importsOf.js";
import { outOfReachIn } from "../../__tests__/support/outOfReach.js";
import { withoutComments } from "../../__tests__/support/withoutComments.js";

// What a connection key can reach is decided by what src/mcp imports (design
// d.3, d.4). It reads through the services the REST routes call, and never
// reaches the routes, their middleware, the database client, the schema or
// drizzle-orm: every query lives in the services layer, so a tool selects
// fields and computes nothing. Nor does it reach the database client a
// context carries (`read.db`, `$client`), build SQL, load a module by a
// computed path, or import a database driver. Write services are imported only by the write
// tools, and by tools/foods.ts for the barcode lookup, which is a read. A
// write tool reaches a write only through services/writes/recorded/ and the
// record, so no write runs without the connection as its actor and its
// record row. The write tools never join READ_TOOLS. It never names a
// deletion the screen offers without a restore, nor approving a deletion:
// those stay out of an assistant's reach.

const ROOT = join(process.cwd(), "src", "mcp");
const FORBIDDEN = [
  /\/routes\//,
  /\/middleware\//,
  /\/db\//,
  /^drizzle-orm(\/|$)/,
  // Database drivers: a tool that opened its own pool would bypass the services.
  /^(pg|pg-[\w-]+|postgres|mysql2?|sqlite3|better-sqlite3|@neondatabase\/[\w-]+|@vercel\/postgres)(\/|$)/,
  // createRequire loads a module by name with no import to read.
  /^(node:)?module$/,
];
/**
 * The lib/ modules src/mcp may import. Others reach the database or mint
 * sessions (lib/sessions, lib/users, lib/passport), so a new one joins this
 * list on purpose, after checking what it can do with a key's user.
 */
const LIB_ALLOWED = new Set(["clientIp", "connectionKeys", "env", "errors", "failureOf", "requestContext"]);
const LIB_IMPORT = /(?:^|\/)lib\/([^/]+)\.js$/;
// What reaches the database client a context carries, or builds SQL by hand.
const RAW_DATABASE = [
  ["the database client", /\bdb\b/],
  ["the driver client", /\$client\b/],
  ["a sql template or helper", /\bsql\s*[`.(]/],
  ["a raw execute", /\.execute\s*\(/],
  ["a raw query", /\.query\s*\(/],
] as const;
/** Every `import(` in a file, and whether its argument is one plain string literal. */
const DYNAMIC_IMPORT = /\bimport\s*\(/g;
const LITERAL_ARGUMENT = /^\s*(["'])[^"'`$\n]*\1\s*\)/;
const WRITE_SERVICES = /\/services\/writes\//;
const BARCODE = /\/services\/writes\/barcode\.js$/;
/** What a write tool may import from the write services: the recorded writes and the record. */
const THROUGH_THE_RECORD = /\/services\/writes\/(recorded\/[\w-]+|changeRecord)\.js$/;
/** The record. Only tools/writes/run.ts imports it, for the replay, the hash and the hourly count. */
const THE_RECORD = /\/services\/writes\/changeRecord\.js$/;
const RUN = "tools/writes/run.ts";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "__tests__" ? [] : sourceFiles(path);
    return name.endsWith(".ts") ? [path] : [];
  });
}

const source = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("src/mcp import boundary", () => {
  const files = sourceFiles(ROOT).map((path) => relative(ROOT, path));

  it("finds the server files", () => {
    expect(files).toEqual(
      expect.arrayContaining(["router.ts", "server.ts", "auth.ts", "result.ts", "appRules.ts", "tools/context.ts"]),
    );
  });

  it.each(files)("%s imports no route, middleware, database module or drizzle-orm", (file) => {
    const offenders = importsOf(source(file)).filter((path) => FORBIDDEN.some((pattern) => pattern.test(path)));
    expect(offenders).toEqual([]);
  });

  it.each(files)("%s imports dynamically only by a plain string literal", (file) => {
    const text = source(file);
    const offenders = [...text.matchAll(DYNAMIC_IMPORT)]
      .map((m) => text.slice(m.index + m[0].length, m.index + m[0].length + 80))
      .filter((rest) => !LITERAL_ARGUMENT.test(rest));
    expect(offenders).toEqual([]);
  });

  it.each(files)("%s reaches no database client and builds no SQL", (file) => {
    const code = withoutComments(source(file));
    const named = RAW_DATABASE.filter(([, pattern]) => pattern.test(code)).map(([what]) => what);
    expect(named).toEqual([]);
  });

  it.each(files)("%s imports from lib/ only the modules allowed to it", (file) => {
    const offenders = importsOf(source(file))
      .map((path) => LIB_IMPORT.exec(path)?.[1])
      .filter((name): name is string => name !== undefined && !LIB_ALLOWED.has(name));
    expect(offenders).toEqual([]);
  });

  it("strips comments but keeps a string that holds //", () => {
    const code = withoutComments('const sep = "//"; db.select(); // db\n/* $client */ x');
    expect(code).toContain("db.select()");
    expect(code).not.toContain("$client");
    expect(code).not.toMatch(/\/\/ db/);
  });

  it("imports the write services only from the write tools, and the barcode lookup from tools/foods.ts", () => {
    const offenders = files.flatMap((file) =>
      importsOf(source(file))
        .filter((path) => WRITE_SERVICES.test(path))
        .filter((path) => !file.startsWith("tools/writes/") && !(file === "tools/foods.ts" && BARCODE.test(path)))
        .map((path) => `${file} imports ${path}`),
    );
    expect(offenders).toEqual([]);
  });

  it("has write tools, and they import the recorded writes", () => {
    const writeTools = files.filter((file) => file.startsWith("tools/writes/") && !/\/(run|index)\.ts$/.test(file));
    expect(writeTools).toEqual(
      expect.arrayContaining([
        "tools/writes/entries.ts",
        "tools/writes/foods.ts",
        "tools/writes/meals.ts",
        "tools/writes/targets.ts",
      ]),
    );
    for (const file of writeTools) {
      expect(importsOf(source(file)).filter((path) => /\/services\/writes\/recorded\//.test(path))).not.toEqual([]);
    }
  });

  it("lets a write tool reach a write service only through the recorded writes and the record", () => {
    const offenders = files
      .filter((file) => file.startsWith("tools/writes/"))
      .flatMap((file) =>
        importsOf(source(file))
          .filter((path) => WRITE_SERVICES.test(path) && !THROUGH_THE_RECORD.test(path))
          .map((path) => `${file} imports ${path}`),
      );
    expect(offenders).toEqual([]);
  });

  it("imports the record only into tools/writes/run.ts", () => {
    const offenders = files
      .filter((file) => file !== RUN)
      .flatMap((file) =>
        importsOf(source(file))
          .filter((path) => THE_RECORD.test(path))
          .map((path) => `${file} imports ${path}`),
      );
    expect(offenders).toEqual([]);
  });

  it.each(files)(
    "%s never calls recordedWrite itself, so every write goes through services/writes/recorded/",
    (file) => {
      expect(withoutComments(source(file))).not.toMatch(/\brecordedWrite\b/);
    },
  );

  it("keeps the write tools out of the read registry and the read tools' files", () => {
    const offenders = files
      .filter((file) => !file.startsWith("tools/writes/") && file !== "server.ts")
      .flatMap((file) =>
        importsOf(source(file))
          .filter((path) => /(^|\/)writes\//.test(path) && !WRITE_SERVICES.test(path))
          .map((path) => `${file} imports ${path}`),
      );
    expect(offenders).toEqual([]);
  });

  it.each(files)("%s names nothing out of an assistant's reach", (file) => {
    expect(outOfReachIn(source(file))).toEqual([]);
  });
});
