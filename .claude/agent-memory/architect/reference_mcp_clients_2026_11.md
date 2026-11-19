---
name: MCP SDK and Claude client facts (verified 2026-11-19)
description: SDK versions finanssi pins vs npm latest, which Claude clients take a static bearer key, mcp-remote status. Fast-moving, re-verify before use
type: reference
---

Verified 2026-11-19. Re-check before relying on it.

- Finanssi `origin/master` lockfile: `@modelcontextprotocol/server` 2.3.1, `express` 2.0.2, `node` 2.1.1, `client` 2.3.1. npm latest: server/client/core 2.4.0, node 2.1.2 (2026-10-23). 2.4.0 breaking notes: `x-mcp-header` on number params, `outputSchema` unwrapping on 2025-11-25, Ajv `$id` URI check. Source: github.com/modelcontextprotocol/typescript-sdk/releases.
- Hovimestari already runs zod 4.6.7 everywhere, so finanssi's `zod-v4` alias is not needed.
- Claude Code: `claude mcp add --transport http <name> <url> --header "Authorization: Bearer …"`, `--scope user` (code.claude.com/docs/en/mcp). SSE deprecated.
- Claude Desktop/web/mobile custom connectors: by URL from Anthropic infra (no localhost). Static key only via "Request headers", beta for limited orgs; otherwise OAuth (claude.com/docs/connectors/custom/add-unlisted).
- `mcp-remote`: README still documents `--header Authorization:${AUTH_HEADER}` + env for Windows. npm latest 0.16.7, finanssi pins 0.14.3.
- ChatGPT custom MCP connectors: static bearer support unverified, sources disagree.
- finanssiappisv2's local tree is stale: read it only via `git -C ... show origin/master:<path>` after a fetch.
