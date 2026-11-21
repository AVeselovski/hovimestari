# A new MCP tool must be named in seven places

Adding a tool (R3a, 2026-11-20) failed four suites in the full run that the tool's own suite never touched. Every list below names each tool or counts them, by hand, on purpose:

- `src/mcp/__tests__/registries.test.ts`: the counts and the write tools in order.
- `src/mcp/__tests__/readTools.db.test.ts`: `READ_TOOL_NAMES` and the count in its title.
- `src/mcp/__tests__/router.test.ts`: read, read plus write, and write counts.
- `src/mcp/__tests__/writesOff.test.ts`: both counts, and a NEW `services/writes/recorded/*.ts` file must be mocked there with all its exports, or the suite fails to load ("does not provide an export named goneAsNull").
- `src/mcp/__tests__/importBoundary.test.ts` and `services/writes/recorded/__tests__/screenPath.test.ts`: the lists of write tool files and recorded files.
- `src/scripts/mcpSmoke/checks.ts`: `READ_TOOL_NAMES` and `WRITE_TOOL_NAMES`, in registry order.

Grep for the last tool's name before the first full run.
