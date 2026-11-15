# Design: <feature or change name>

<!--
The architect's design-doc skeleton. Copy it to docs/design/<short-name>.md and fill it in.
docs/design/ is the agents' workspace. The owner does not read it, so process language,
decision numbers, requirement IDs and rejected-alternative rationale belong here and nowhere
in the human-facing docs.

House rules:
- Design the whole doc assuming every recommendation in section 0, so a flip is a localised edit.
- Every open question carries a stated assumption, so implementation starts without waiting.
- Settled owner decisions are implemented and their rationale recorded, never relitigated.
- When the mechanism is delegated, give one primary proposal plus a table of rejected
  alternatives, never a menu.
- A code sample here is a claim. Check it against the real function before you write it down.
-->

Status: draft | in review | approved | implemented
Branch: `feat/<short-description>`
Requested by: Artur | <source of the request>

## 0. Product decisions the owner may want to shelve

<One row per genuinely reversible product choice. State the fork neutrally. The rest of the doc assumes the recommendation. Out-of-scope defects found while reading the code go here too, marked "file separately".>

| #   | Fork                           | Recommendation, and why | Cost if flipped                                         |
| --- | ------------------------------ | ----------------------- | ------------------------------------------------------- |
| 0.1 | <Option A or option B>         | <A, because ...>        | <What changes if the owner picks B: files, tests, docs> |
| 0.2 | <Defect found in passing: ...> | File separately         | <None for this change>                                  |

## 1. Requirements validation

<Compare the request with docs/requirements.md. Verdict: aligned, aligned with gaps resolved by stated assumptions, or conflicting. A real conflict stops the design and becomes an escalation report instead: what was requested, what the requirements say, why they conflict, the risk, a recommendation.>

| Requirement | How this design meets it | Note                       |
| ----------- | ------------------------ | -------------------------- |
| FR-AREA-NN  | <...>                    | <gap, assumption or drift> |

**The problem, stripped of the proposed mechanism:** <restate what the request is trying to achieve. Then accept or reject the proposed mechanism against the forced-workaround test: one workaround is a smell, two is a stop signal.>

**Changes proposed that were not asked for:** <list them here so the owner can see them. Each one also appears in section h as an open question.>

**Requirements drift:** <where docs/requirements.md or docs/overview.md no longer matches what is built or intended, with proposed replacement wording. Never edit those files.>

## a) Overview

<One paragraph: what is being built and why.>

## b) Components and responsibilities

<Each component created or modified: what it does, what it owns, what it depends on.>

| Component      | Change                   | Owns  | Depends on |
| -------------- | ------------------------ | ----- | ---------- |
| <path or name> | new / modified / removed | <...> | <...>      |

## c) Data model

<New or changed tables, columns, constraints, indexes and migrations. Say how existing rows are migrated and how the change rolls back.>

## d) API interface

<Each endpoint: method, path, request shape, response shape, errors, who may call it. Shared request and response types and where they live.>

## e) Data flow

<How data moves for the main paths, step by step: user action, request, server work, response, what refreshes on screen.>

## f) Frontend architecture

<Pages, components, hooks and state. Loading, empty and error states. Behaviour at phone width and desktop width. Copy, quoted exactly. Which tokens and shared primitives it uses.>

## g) Constraints and decisions

<The technical decisions, each with its reason. Lead with an established library for commodity infrastructure such as i18n, auth, ORM or validation, and put the homegrown path under rejected alternatives. The unstated criterion is who maintains it in two years.>

### Rejected alternatives

| Alternative         | Why it was rejected                                                                   |
| ------------------- | ------------------------------------------------------------------------------------- |
| <Named alternative> | <The concrete cost: workarounds it forces, machinery it adds, maintenance it creates> |

### Non-questions

<Things settled by a stated constraint, listed so they are not relitigated.>

- <Settled by ...: ...>

## h) Open questions and risks

<Only what genuinely needs the owner: data-model forks, product-surface choices, anything expensive to reverse. Every question carries an assumption so work starts now.>

1. <Question>
   > **Assumption:** <what the implementation does until told otherwise>. One-line flip if you disagree: <what changes>.

**Risks:** <cross-file risks, such as a file another agent is editing at the same time, performance, migrations, security.>

## i) Docs

<Which docs this change updates, in the same change as the code.>

- Feature docs: `docs/features/<feature>.md` (<new / changed sections>)
- Page docs: `docs/app/<page>.md` (<...>)
- Catalog: the `docs/features.md` line for <feature> (<new / changed>)
- Link map: new home headings and their rows in `docs/design/link-map.md`
- READMEs: <...>

## j) Implementation plan

<Ordered steps, each mapped to an agent, each with its exit check. Tests are part of every step.>

The orchestrator invokes each engineer. Each engineer invokes the validator. The validator invokes the ui-validator for a user-visible change and the reviewer otherwise, and the ui-validator invokes the reviewer. After the reviewer passes, the orchestrator invokes the documentation-specialist. A design review by the reviewer, at the orchestrator's call, comes before step 1.

| Step | Agent                    | Invoked by                                              | Work                                                    | Exit check                                  |
| ---- | ------------------------ | ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| 1    | backend-engineer         | orchestrator                                            | <...>                                                   | <tests that fail before and pass after>     |
| 2    | frontend-engineer        | orchestrator                                            | <...>                                                   | <...>                                       |
| 3    | validator                | the engineer                                            | Validate against section 1                              | Pass, or at most 2 fix cycles then escalate |
| 4    | ui-validator             | validator, for a user-visible change                    | Real browser at real widths, compared with the page doc | <widths and states>                         |
| 5    | reviewer                 | ui-validator, or validator when nothing is user-visible | Diff review, docs included                              | No open critical or major findings          |
| 6    | documentation-specialist | orchestrator                                            | Catalog, feature and page docs, link map                | `pnpm docs:check` reports zero findings     |

## Resolved defaults (orchestrator, DATE, owner may veto)

<The calls made in the owner's absence, one line each, so the owner can veto a single one without rereading the design.>

- <Default chosen>: <reason>. Veto cost: <what changes>.
