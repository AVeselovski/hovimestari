import type { CallToolResult, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { AppError } from "../lib/errors.js";
import { failureOf } from "../lib/failureOf.js";
import type { contextForUser } from "../lib/requestContext.js";
import type { ConnectionAuthExtra } from "./auth.js";

// ---------------------------------------------------------------------------
// Tool definitions, the result envelope and error mapping (design d.3),
// lifted from finanssiappisV2's mcp/result.ts.
//
// Every successful result is one text block of compact JSON wrapped in the
// envelope: the user's today and time zone, how to read the figures, and
// the service's answer as `data`, its fields named as the REST answer names
// them. The MCP layer selects fields and never computes a figure.
// ---------------------------------------------------------------------------

/** What a tool body gets: the service context of the key's user, and the key itself. */
export interface ToolContext {
  /**
   * Built by `contextForUser` for this call, exactly as a REST route builds
   * it. Typed as what that function returns, a write service's context, so
   * the barcode lookup can take it. Which services a tool may call at all is
   * the import boundary's to decide.
   */
  read: ReturnType<typeof contextForUser>;
  auth: ConnectionAuthExtra;
  /** The key can write and writing is switched on. */
  canWrite: boolean;
}

export interface Tool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  inputSchema: S;
  /** Merged over the read tools' annotations. Only `look_up_barcode` sets one: it may call Open Food Facts. */
  annotations?: { openWorldHint: boolean };
  run: (args: z.output<S>, ctx: ToolContext) => Promise<unknown>;
}

/** Keeps the args type of each tool while letting the set be one array. */
export function defineTool<S extends z.ZodObject>(tool: Tool<S>): Tool<S> {
  return tool;
}

export const GENERIC_ERROR = "Something went wrong reading Hovimestari. Try again.";

export const UNITS =
  "Energy in kcal. Protein, carbohydrates and fat in grams. eaten and withPlan are the two readings of a day.";

export function envelope(ctx: ToolContext, data: unknown) {
  return { today: ctx.read.today, timeZone: ctx.read.timeZone, units: UNITS, data };
}

export function text(value: string, isError = false): CallToolResult {
  return { ...(isError ? { isError: true } : {}), content: [{ type: "text", text: value }] };
}

/**
 * An AppError as the model reads it: its client-safe message, then its code,
 * and for a limit the seconds until a retry can work. A tool never answers
 * HTTP 429, which a bridge would retry on its own.
 */
export function refusalText(err: AppError): string {
  const notes = [
    err.code,
    err.retryAfterSeconds === undefined ? undefined : `retryAfterSeconds: ${err.retryAfterSeconds}`,
  ]
    .filter((note) => note !== undefined)
    .join(", ");
  return notes ? `${err.message} (${notes})` : err.message;
}

/** The tool log line: the tool, the connection, the time and the outcome. Never an argument, a key, a name or a figure. */
export function toolLine(tool: string, connectionId: string, ms: number, outcome: "ok" | "refused" | "error"): string {
  return `mcp tool=${tool} conn=${connectionId} ms=${ms} ${outcome}`;
}

/**
 * `tool`'s input schema as the SDK takes it, logging a refused input. The SDK
 * checks the input before the handler runs, so `runTool` never sees a call it
 * refuses there: this logs that call's line, `refused`, in the same shape.
 * The JSON schema the SDK lists is the tool's own.
 */
export function loggedInput<S extends z.ZodObject>(
  tool: Tool<S>,
  connectionId: string,
): StandardSchemaWithJSON<z.input<S>, z.output<S>> {
  const standard = tool.inputSchema["~standard"];
  return {
    "~standard": {
      ...standard,
      async validate(value: unknown) {
        const started = Date.now();
        const result = await standard.validate(value);
        if (result.issues) console.log(toolLine(tool.name, connectionId, Date.now() - started, "refused"));
        return result;
      },
    },
  };
}

/**
 * Runs one tool body and shapes its answer. An AppError's message is
 * client-safe by the repo's definition, so it goes back as an `isError`
 * result with its code. Anything else is logged with `failureOf` (stack,
 * SQLSTATE, constraint) and answered with a generic message. The tool line
 * names the tool, the connection, the time and the outcome, never the
 * arguments, the key, a name or a figure.
 */
export async function runTool<S extends z.ZodObject>(
  tool: Tool<S>,
  args: z.output<S>,
  ctx: ToolContext,
): Promise<CallToolResult> {
  const started = Date.now();
  const line = (outcome: "ok" | "refused" | "error") =>
    toolLine(tool.name, ctx.auth.connectionId, Date.now() - started, outcome);
  try {
    const data = await tool.run(args, ctx);
    console.log(line("ok"));
    return text(JSON.stringify(envelope(ctx, data)));
  } catch (err) {
    if (err instanceof AppError) {
      console.log(line("refused"));
      return text(refusalText(err), true);
    }
    console.log(line("error"));
    console.error(`mcp tool=${tool.name} conn=${ctx.auth.connectionId}`, failureOf(err));
    return text(GENERIC_ERROR, true);
  }
}
