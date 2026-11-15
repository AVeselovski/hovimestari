#!/usr/bin/env node
// Writes the local env files from their examples, with generated secrets.
//
//   apps/backend/.env.example -> apps/backend/.env
//   apps/web/.env.example     -> apps/web/.env.local   (once the web app exists)
//
// JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and BFF_SECRET are filled with 32
// random bytes in hex. BFF_SECRET is one value shared by both files, because
// the web server presents it and the backend checks it. An existing env file
// is never overwritten, so running this twice changes nothing.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  { example: "apps/backend/.env.example", out: "apps/backend/.env" },
  { example: "apps/web/.env.example", out: "apps/web/.env.local" },
];

const secret = () => randomBytes(32).toString("hex");

/** Fills each generated key that the example leaves empty. */
export function fill(text, values) {
  return text.replace(/^([A-Z0-9_]+)=$/gm, (line, key) => (key in values ? `${key}=${values[key]}` : line));
}

function main() {
  const values = {
    JWT_ACCESS_SECRET: secret(),
    JWT_REFRESH_SECRET: secret(),
    BFF_SECRET: secret(),
  };
  // A shared BFF_SECRET must match the one already written, or the relay fails.
  for (const { out } of TARGETS) {
    const file = path.join(root, out);
    if (!existsSync(file)) continue;
    const match = /^BFF_SECRET=(.+)$/m.exec(readFileSync(file, "utf8"));
    if (match) values.BFF_SECRET = match[1].trim();
  }

  for (const { example, out } of TARGETS) {
    const from = path.join(root, example);
    const to = path.join(root, out);
    if (!existsSync(from)) continue;
    if (existsSync(to)) {
      console.log(`${out} exists, left as it is.`);
      continue;
    }
    writeFileSync(to, fill(readFileSync(from, "utf8"), values), { mode: 0o600 });
    console.log(`${out} written with generated secrets.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
