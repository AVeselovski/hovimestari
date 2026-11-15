#!/usr/bin/env node
// Checks human-facing docs against the docs standard (.claude/agents/documentation-specialist.md).
// Usage: node scripts/check-docs.mjs [--summary] [file ...]   (no files = every in-scope doc)
// Exit code 1 when anything is reported, a named file does not exist, the config file is
// missing, or the configured scope resolves to no files.
//
// Scope comes from docs/check-docs.config.json at the repo root:
//   files  individual docs to check
//   dirs   directories whose *.md files are checked (not recursive)
//   kinds  path prefix -> doc kind. A key is a directory prefix ("docs/features/") or a
//          single file ("docs/_templates/feature.md"), and the longest matching key wins.
//          The kind picks the required H2 shape (feature, page or setup). Any other path
//          is only checked for prose and links.
// The repo root is $DOCS_ROOT when set, otherwise the parent of scripts/.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.DOCS_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const summary = args.includes("--summary");
const explicit = args.filter((a) => !a.startsWith("--"));

const CONFIG_REL = "docs/check-docs.config.json";
const CONFIG_PATH = join(ROOT, CONFIG_REL);
if (!existsSync(CONFIG_PATH)) {
  console.error(`check-docs: config not found at ${CONFIG_REL} (looked in ${ROOT}). Create it to set the scope.`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));

// Repo-relative paths always use forward slashes, so config keys match on every OS.
const posix = (p) => p.split(sep).join("/");
const md = (dir) =>
  existsSync(join(ROOT, dir))
    ? readdirSync(join(ROOT, dir))
        .filter((f) => f.endsWith(".md"))
        .map((f) => `${dir.replace(/\/+$/, "")}/${f}`)
    : [];

// File arguments resolve against the repo root, so relative and absolute paths both work.
const missing = [];
const files = explicit.length
  ? explicit.flatMap((arg) => {
      const abs = resolve(ROOT, arg);
      if (!existsSync(abs)) {
        missing.push(arg);
        return [];
      }
      return [posix(relative(ROOT, abs))];
    })
  : [...(config.files ?? []), ...(config.dirs ?? []).flatMap(md)].filter((f) => existsSync(join(ROOT, f)));

// An empty scope is a misconfiguration, never a pass.
if (!explicit.length && !files.length) {
  console.error(
    (config.files ?? []).length || (config.dirs ?? []).length
      ? `check-docs: ${CONFIG_REL} lists files or dirs, but none of them resolve to a doc under ${ROOT}.`
      : `check-docs: ${CONFIG_REL} lists no files and no dirs, so there is nothing to check.`,
  );
  process.exit(1);
}

// GitHub heading slug.
const slug = (text) =>
  text
    .replace(/`/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");

const anchorCache = new Map();
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const seen = new Map();
  const out = new Set();
  let fence = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const base = slug(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n === 0 ? base : `${base}-${n}`);
  }
  anchorCache.set(file, out);
  return out;
}

const kindOf = (f) =>
  Object.entries(config.kinds ?? {})
    .filter(([prefix]) => f.startsWith(prefix))
    .sort(([a], [b]) => b.length - a.length)[0]?.[1] ?? "other";

// A doc path in prose that is not a link: any path into a configured dir, written from
// the repo root (docs/features/x.md) or from a sibling dir (../features/x.md).
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dirNames = (config.dirs ?? []).map((d) => d.replace(/\/+$/, ""));
const UNLINKED = dirNames.length
  ? new RegExp(
      `(?:${dirNames.map(esc).join("|")}|\\.\\./(?:${dirNames.map((d) => esc(d.split("/").pop())).join("|")}))/[\\w-]+\\.md`,
    )
  : null;

// Required H2s per kind. "first" fixes the opening two in order. Every "tail" H2 is a
// required closer, and no other H2 may appear.
const SHAPES = {
  feature: { first: ["In detail", "How it works"], tail: ["Where it appears"] },
  page: { first: ["In detail", "How it works"], tail: ["Features on this page"] },
  setup: { first: ["Steps", "Check it works"], tail: ["Before production"] },
};

const findings = [];
const add = (file, line, rule, text) => findings.push({ file, line, rule, text: text.trim().slice(0, 140) });

for (const file of files) {
  const abs = join(ROOT, file);
  const lines = readFileSync(abs, "utf8").split("\n");
  const kind = kindOf(file);
  let fence = false;
  const h2 = [];
  let inKnownGaps = false;

  lines.forEach((raw, i) => {
    const n = i + 1;
    if (/^\s*```/.test(raw)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    const h = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (h) {
      if (h[1] === "##") h2.push({ title: h[2].trim(), line: n });
      inKnownGaps = /^known gaps$/i.test(h[2].trim());
    }
    // Prose: the line with inline code spans and link targets removed.
    const prose = raw.replace(/`[^`]*`/g, "").replace(/\]\([^)]*\)/g, "]");
    if (/;/.test(prose)) add(file, n, "semicolon", raw);
    if (/[—–]/.test(prose)) add(file, n, "dash", raw);
    const isReqLine = /^\s*Requirements?:/i.test(prose);
    if (/\b(?:N?FR)-[A-Z]+-\d+/.test(prose) && !isReqLine) add(file, n, "requirement-id", raw);
    if (/\b(?:D|R|Q)\d{1,2}\b|§\s?\d/.test(prose) && !isReqLine) add(file, n, "decision-id", raw);
    if (/(?<![\w/])#\d{2,4}\b/.test(prose) && !inKnownGaps) add(file, n, "issue-ref", raw);
    // A file reference with a line number, `routes.py:42`, in any language. A host with a port,
    // `example.com:8080`, is left alone.
    if (/\.(?!(?:com|org|net|io|dev|app|local|internal)\b)[A-Za-z0-9]{1,5}:\d+\b/.test(raw))
      add(file, n, "line-number", raw);
    if (/\((?:[^()]*\([^()]*\)){1,}[^()]*\)/.test(prose)) add(file, n, "nested-parens", raw);

    for (const m of raw.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:)/.test(target)) continue;
      const [path, anchor] = target.split("#");
      const dest = path ? resolve(dirname(abs), path) : abs;
      if (!existsSync(dest)) {
        add(file, n, "broken-link", target);
        continue;
      }
      if (anchor && dest.endsWith(".md") && !anchorsOf(dest).has(anchor)) add(file, n, "broken-anchor", target);
    }
    // A doc path in prose that is not a link.
    if (UNLINKED?.test(raw.replace(/\]\([^)]*\)/g, "]"))) add(file, n, "unlinked-path", raw);
  });

  const want = SHAPES[kind];
  if (want) {
    const titles = h2.map((x) => x.title);
    const [a, b] = want.first;
    if (titles[0] !== a || titles[1] !== b) add(file, 1, "shape", `H2s: ${titles.join(" | ")}`);
    const extra = titles.slice(2).filter((t) => !want.tail.includes(t));
    if (extra.length) add(file, 1, "shape", `unexpected H2s: ${extra.join(" | ")}`);
    const absent = want.tail.filter((t) => !titles.includes(t));
    if (absent.length) add(file, 1, "shape", `missing H2s: ${absent.join(" | ")}`);
    const intro = lines
      .slice(1, (h2[0]?.line ?? lines.length) - 1)
      .join("\n")
      .trim();
    const paras = intro.split(/\n\s*\n/).filter(Boolean);
    if (paras.length > 2) add(file, 1, "long-intro", `${paras.length} paragraphs before the first H2`);
  }
}

const rel = (f) => relative(ROOT, join(ROOT, f));
if (summary) {
  const byRule = {};
  const byFile = {};
  for (const f of findings) {
    byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
    byFile[rel(f.file)] = (byFile[rel(f.file)] ?? 0) + 1;
  }
  console.log(JSON.stringify(byRule, null, 2));
  console.log(
    Object.entries(byFile)
      .sort((x, y) => y[1] - x[1])
      .map(([f, c]) => `${String(c).padStart(4)}  ${f}`)
      .join("\n"),
  );
} else {
  for (const f of findings) console.log(`${rel(f.file)}:${f.line}  [${f.rule}]  ${f.text}`);
}
for (const m of missing) console.log(`no such file: ${m}`);
console.log(`\n${findings.length} finding(s) in ${files.length} file(s)`);
process.exit(findings.length || missing.length ? 1 : 0);
