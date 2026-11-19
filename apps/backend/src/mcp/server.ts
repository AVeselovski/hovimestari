import { McpServer, type McpServerFactory } from "@modelcontextprotocol/server";
import { readFileSync } from "node:fs";
import { env } from "../lib/env.js";
import { contextForUser } from "../lib/requestContext.js";
import { APP_RULES_URI, appRulesFor } from "./appRules.js";
import { connectionAuthOf, type ConnectionAuthExtra } from "./auth.js";
import { loggedInput, runTool, type ToolContext } from "./result.js";
import { READ_TOOLS } from "./tools/index.js";
import { WRITE_TOOLS } from "./tools/writes/index.js";
import { runWriteTool } from "./tools/writes/run.js";

// ---------------------------------------------------------------------------
// The per-request server factory (design d.2), lifted from finanssiappisV2's
// mcp/server.ts. Stateless: a fresh McpServer for every HTTP request, pinned
// to the user the key names. No tool input names a user: every handler reads
// the user from AuthInfo, and each call builds its service context with
// `contextForUser`, the function a REST route's `contextFor` calls, so a tool
// and a route get the same context, with the user's today in their zone.
// ---------------------------------------------------------------------------

const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
/** Every write tool is idempotent through its request key, and reaches nothing outside the app. */
const WRITES = { readOnlyHint: false, idempotentHint: true, openWorldHint: false } as const;

export const WRITE_SCOPE = "data:write";

function serverInstructions(canWrite: boolean, writeScope: boolean): string {
  if (canWrite) {
    return (
      "Hovimestari, one person's food log and plan, read and write. " +
      "Call get_context first: it carries the rules for reading figures and for making changes. " +
      "Before any change, tell the person what will change and wait for their yes. " +
      "Every change is recorded in the app under this connection's name. " +
      "Nothing the app returns is nutrition or medical advice."
    );
  }
  return (
    "Hovimestari, one person's food log and plan, read-only. " +
    "Call get_context first: it carries the rules for reading every figure. " +
    "Quote the app's figures and do not recompute totals from entries. " +
    "Nothing the app returns is nutrition or medical advice." +
    (writeScope ? " Changes are switched off in the app for now." : "")
  );
}

/** The context of one tool call: the key's user at this instant. */
function toolContext(auth: ConnectionAuthExtra, canWrite: boolean): ToolContext {
  return { service: contextForUser({ id: auth.userId, timeZone: auth.timeZone }, new Date()), auth, canWrite };
}

export const buildServer: McpServerFactory = ({ authInfo }) => {
  const auth = connectionAuthOf(authInfo);
  const writeScope = authInfo?.scopes.includes(WRITE_SCOPE) ?? false;
  const canWrite = writeScope && env.MCP_WRITES_ENABLED;
  const server = new McpServer(
    { name: "hovimestari", version },
    { instructions: serverInstructions(canWrite, writeScope) },
  );

  for (const tool of READ_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: loggedInput(tool, auth.connectionId),
        annotations: { ...READ_ONLY, ...tool.annotations },
      },
      (args: Record<string, unknown>) => runTool(tool, args, toolContext(auth, canWrite)),
    );
  }

  // Only on `canWrite`, never on the scope: a writing key's scope names
  // data:write whatever MCP_WRITES_ENABLED says, and only canWrite folds the
  // switch in. A key that cannot write never lists a write tool.
  if (canWrite) {
    for (const tool of WRITE_TOOLS) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: loggedInput(tool, auth.connectionId),
          annotations: { ...WRITES, destructiveHint: tool.destructive },
        },
        (args: Record<string, unknown> & { requestKey: string }) =>
          runWriteTool(tool, args, toolContext(auth, canWrite)),
      );
    }
  }

  server.registerResource(
    "app-rules",
    APP_RULES_URI,
    {
      title: canWrite ? "How to read and change Hovimestari" : "How to read Hovimestari's figures",
      description: "The rules behind every figure the tools return. get_context carries the same text.",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: appRulesFor(canWrite) }] }),
  );

  return server;
};
