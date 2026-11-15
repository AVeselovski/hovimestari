# How the docs fit together

The docs system has a few parts, each with one job. This page says what each part is for and how they connect. The standard itself, the shape of each doc, the tone, the linking and the length rules, lives in one place: `.claude/agents/documentation-specialist.md`. This page does not restate it.

## Why the system exists

A stale doc is worse than none, because it makes people and agents confidently wrong about what exists. So the docs are kept true in the same change as the code, every fact has one home, and a script checks the rules a person would otherwise have to remember.

## The parts

### The requirements and the overview

`docs/requirements.md` is the source of truth for what the product must do. `docs/overview.md` frames what is being built. Both belong to the owner. Agents read them on every non-trivial change and never edit them without permission. When they drift from what is built, an agent reports the drift with proposed wording.

### The feature catalog

`docs/features.md` lists every feature, one or two sentences each, with a link to its detail doc. It is where everyone starts: the cheapest way to find out whether something exists and where it is documented. Anything not listed is not built. Each catalog line is the feature doc's intro, shortened, so the two say the same thing.

### Feature docs

`docs/features/<feature>.md` says what a feature is and how it works: its behaviour, rules, computation, API and data. A rule lives here and nowhere else. Each feature doc has three levels, so a reader can stop after the intro, after "In detail" or after "How it works". The skeleton is [the feature template](../_templates/feature.md).

### Page docs

`docs/app/<page>.md` says what a page is for, what it shows, its layout and which features it composes. It links the feature docs for their rules and never restates them. Feature docs and page docs are two axes: a page composes several features, and a feature appears on several pages. The skeleton is [the page template](../_templates/page.md).

### Setup runbooks

`docs/setup/<runbook>.md` is a how-to that a person runs by hand: an intro, the steps, how to check it works and what must change before production. Its steps stay exact. The skeleton is [the setup template](../_templates/setup.md).

### The templates

The three skeletons live in `docs/_templates/`, not in the folders they fill. Agents glob `docs/features/`, `docs/app/` and `docs/setup/` to learn what exists, and a template inside them would read as a feature that is built. The checker still holds each template to the shape of the doc it starts.

### READMEs

Each README says what its folder is, names the key files, shows how to do the common task and states the rules that bind you. A source-tree listing is one line per file. READMEs link feature docs for behaviour rather than describing it.

### The design workspace

`docs/design/` is the agents' workspace. The owner does not read it. Design docs, plans, rationale, history, decision numbers and requirement citations live here and nowhere else in `docs/`. The architect's skeleton is `docs/design/_design-doc-template.md`.

### The link map

Every concept has one home: a heading in the doc that owns it. `docs/design/link-map.md` lists each concept and its home heading. The first mention of a concept in a human-facing doc links to its home. A new home heading adds its row to the link map in the same change. A renamed home heading repoints every link to it in the same change, because links point at the heading's anchor.

### The checker

`scripts/check-docs.mjs` checks the human-facing docs against the standard: the prose rules (no semicolons, no dashes, no requirement, decision or issue IDs in prose, no nested parentheses, no line numbers), the links and anchors, and the shape of each kind of doc. `docs/check-docs.config.json` sets which files and folders are in scope and which shape each folder takes. Run it on every doc you change, or with no arguments to check them all. It exits with 1 when it reports anything. A finished doc reports zero findings.

### TODO.md

Defects and open items live in `TODO.md`, not in docs and not in chat. A doc names a current limitation once, in its "Known gaps" section. Each `TODO.md` item says what it is, why it is open and who decides, under one of three headings: needs a decision from the owner, ready to pick up, or known gaps deliberately unbuilt.

## Who keeps it true

- Engineers update the feature doc, the page doc and the catalog line in the same change as the code, and run the checker.
- The validator fails a change to behaviour, copy or layout that lacks its doc change.
- The reviewer reviews the docs in the diff.
- The documentation-specialist owns the catalog, the feature and page docs, this playbook, the link map and the checker, and reviews everything against the standard.
