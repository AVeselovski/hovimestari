import { describe, expect, it } from "@jest/globals";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { outOfReachIn } from "../../../../__tests__/support/outOfReach.js";
import { withoutComments } from "../../../../__tests__/support/withoutComments.js";

// An assistant's write is the screen's write (design g.3, d.4). A file under
// services/writes/recorded/ reads (its before-reader and its replay reader)
// and calls the screen's write services through recordedWrite, which alone
// inserts the record. So no file here writes a row of its own, and every
// recorded* function calls exactly one write service, once, inside exactly
// one recordedWrite. Read from the source, since what matters is what the
// code can do, not what one run of it did. Nor does any file here name a
// write service out of an assistant's reach (support/outOfReach.ts), so a
// tool cannot reach one through a recorded wrapper under another name.

const ROOT = join(process.cwd(), "src", "services", "writes", "recorded");
const SQL_WRITES = [/\.insert\s*\(/, /\.update\s*\(/, /\.delete\s*\(/, /\.execute\s*\(/];
/** Modules beside recorded/ that are not write services: the record itself and the context's types. */
const NOT_SERVICES = new Set(["changeRecord", "context"]);

const files = readdirSync(ROOT).filter((name) => name.endsWith(".ts"));
const code = (file: string) => withoutComments(readFileSync(join(ROOT, file), "utf8"));

/** The functions a file imports from the write services beside recorded/, by name. */
function writeServicesIn(text: string): string[] {
  return [...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\.\/(\w+)\.js["']/g)]
    .filter(([, , module]) => !NOT_SERVICES.has(module))
    .flatMap(([, names]) => names.split(","))
    .map((name) => name.trim())
    .filter((name) => name !== "" && !name.startsWith("type "))
    .map((name) => name.split(/\s+as\s+/).pop()!);
}

/** Every exported recorded* function in `text`, with its body. */
function recordedFunctions(text: string): { name: string; body: string }[] {
  return [...text.matchAll(/export\s+async\s+function\s+(recorded\w+)\s*\(/g)].map((m) => {
    // Past the parameter list, whose types may hold braces, to the body's opening brace.
    let i = m.index + m[0].length;
    for (let depth = 1; depth > 0; i++) depth += text[i] === "(" ? 1 : text[i] === ")" ? -1 : 0;
    const open = text.indexOf("{", i);
    let end = open + 1;
    for (let depth = 1; depth > 0; end++) depth += text[end] === "{" ? 1 : text[end] === "}" ? -1 : 0;
    return { name: m[1], body: text.slice(open, end) };
  });
}

const callsOf = (body: string, name: string) => body.match(new RegExp(`\\b${name}\\s*\\(`, "g"))?.length ?? 0;

describe("services/writes/recorded", () => {
  it("holds the recorded writes of every area", () => {
    expect(files).toEqual(
      expect.arrayContaining(["entries.ts", "foods.ts", "recipes.ts", "savedMeals.ts", "targets.ts"]),
    );
  });

  it.each(files)("%s writes no row of its own", (file) => {
    const found = SQL_WRITES.filter((pattern) => pattern.test(code(file))).map(String);
    expect(found).toEqual([]);
  });

  it.each(files)("%s names no write service out of an assistant's reach", (file) => {
    expect(outOfReachIn(readFileSync(join(ROOT, file), "utf8"))).toEqual([]);
  });

  it.each(files)("%s imports every module by name, so the count of write services sees them all", (file) => {
    // A namespace or a run-time import would reach a write service by a name the count does not read.
    expect(code(file).match(/\bimport\s*\*|\bimport\s*\(/g) ?? []).toEqual([]);
  });

  it.each(files)("%s calls one write service in each recorded function, through one recordedWrite", (file) => {
    const text = code(file);
    const services = writeServicesIn(text);
    expect(services.length).toBeGreaterThan(0);
    const functions = recordedFunctions(text);
    expect(functions.length).toBeGreaterThan(0);
    const wrong = functions
      .map(({ name, body }) => ({
        name,
        services: services.flatMap((service) => Array(callsOf(body, service)).fill(service)),
        recordedWrites: callsOf(body, "recordedWrite"),
      }))
      .filter((f) => f.services.length !== 1 || f.recordedWrites !== 1);
    expect(wrong).toEqual([]);
  });

  it("reads a function's body past braces in its parameter types", () => {
    const [fn] = recordedFunctions(
      "export async function recordedX(ctx: C, args: { ids: string[] }) {\n  return recordedWrite(ctx, { run: () => a() });\n}\nother();",
    );
    expect(fn.name).toBe("recordedX");
    expect(fn.body).toContain("a()");
    expect(fn.body).not.toContain("other");
  });
});
