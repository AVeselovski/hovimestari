# Agent memory

Agents whose frontmatter carries `memory: project` keep a persistent memory here, one directory per agent: `architect/`, `reviewer/` and `frontend-engineer/`. The memory is committed, so it is shared with everyone who works in the repo, people and agents alike.

## What each directory holds

- `MEMORY.md` is the index. It is loaded into the agent's context at the start of every run. One line per memory, under about 150 characters: `- [Title](file.md): one-line hook`. It has no frontmatter and holds no memory content. Lines past 200 are truncated, so keep it short.
- Every other file is one memory, with this frontmatter:

```markdown
---
name: <memory name>
description: <one specific line, used to decide relevance in a later run>
type: <user | feedback | project | reference>
---

<The rule or fact. Then a **Why:** line and a **How to apply:** line.>
```

## The four types

- `user`: who the person is, what they know and how they like to work.
- `feedback`: guidance on how to approach work, both corrections and confirmed approaches.
- `project`: ongoing work, decisions and constraints that the code and git history do not show. Dates are absolute.
- `reference`: where to find things in external systems.

## Rules

- **Record only what the code cannot show.** Decisions and their why, owner preferences, risks that came true, and gotchas that cost a round trip. A later run reads the code for everything else.
- **Record from failure and from success.** Corrections are easy to notice. A confirmed non-obvious choice is quieter and just as worth keeping. An agent that saves only corrections grows overly cautious.
- **Keep the why.** A rule without its reason cannot be applied to an edge case.
- **Verify before acting.** A memory that names a file, a function or a flag is a claim about the past. Check it still exists before recommending it. When a memory conflicts with the current code, trust the code and fix the memory.
- **Do not save what the repo already says.** Code structure, file paths, component locations, patterns, git history, fix recipes and anything in `CLAUDE.md` are derived from the repo itself.
- **One topic per file.** Update an existing memory before writing a near duplicate. Remove memories that turn out to be wrong.

## Adding memory to another agent

Add `memory: project` to the agent's frontmatter, create `.claude/agent-memory/<agent>/MEMORY.md`, and tell the agent in its body where its directory is.
