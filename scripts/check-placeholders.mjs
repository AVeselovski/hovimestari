#!/usr/bin/env node
// Lists every unreplaced {{UPPER_SNAKE}} placeholder in the repo.
// Usage: node scripts/check-placeholders.mjs
// Prints each occurrence as "path:line  {{TOKEN}}", then the distinct tokens with their counts.
// Exit code 1 while any placeholder remains, 0 once the repo is fully filled in.
// The repo root is the parent of scripts/. Inside a git repo the scan covers the files git
// tracks or would track (git ls-files -co --exclude-standard), so gitignored folders are
// skipped. Outside git it walks the tree and skips .git and node_modules. Binary files
// and this script are always skipped.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SELF_ABS = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF_ABS), "..");
const SELF = relative(ROOT, SELF_ABS);
const SKIP = new Set([".git", "node_modules"]);
const TOKEN = /\{\{[A-Z][A-Z0-9_]*\}\}/g;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(abs);
    else if (entry.isFile()) yield relative(ROOT, abs);
  }
}

// Repo-relative paths of the files to scan. Null when git is not available here.
function gitFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    });
    // git prints paths relative to cwd with forward slashes. A path deleted from the
    // working tree is still listed by -c, so keep only files that exist.
    const files = [...new Set(out.split("\0").filter(Boolean))]
      .map((p) => p.split("/").join(sep))
      .filter((p) => {
        try {
          return statSync(join(ROOT, p)).isFile();
        } catch {
          return false;
        }
      });
    // An empty list means the root itself is ignored or outside the work tree. Walk instead.
    return files.length ? files : null;
  } catch {
    return null;
  }
}

const hits = [];
for (const file of gitFiles() ?? walk(ROOT)) {
  // This script names the token pattern in its own comments. It is not a placeholder to fill.
  if (file === SELF) continue;
  const buf = readFileSync(join(ROOT, file));
  if (buf.includes(0)) continue;
  buf
    .toString("utf8")
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(TOKEN)) hits.push({ file, line: i + 1, token: m[0] });
    });
}

const counts = new Map();
for (const h of hits) {
  console.log(`${h.file}:${h.line}  ${h.token}`);
  counts.set(h.token, (counts.get(h.token) ?? 0) + 1);
}
if (hits.length) {
  console.log(`\n${counts.size} distinct placeholder(s), ${hits.length} occurrence(s):`);
  for (const [token, n] of [...counts].sort(([a], [b]) => a.localeCompare(b)))
    console.log(`${String(n).padStart(4)}  ${token}`);
} else {
  console.log("No placeholders left.");
}
process.exit(hits.length ? 1 : 0);
