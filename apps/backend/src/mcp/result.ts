import type { CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { AppError } from "../lib/errors.js";
import { failureOf } from "../lib/failureOf.js";
import type { ReadContext } from "../services/reads/context.js";
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
  /** Built by `contextForUser` for this call, exactly as a REST route builds it. */
  read: ReadContext;
  auth: ConnectionAuthExtra;
  /** The key can write and writing is switched on. */
  canWrite: boolean;
}

export interface Tool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  inputSchema: S;
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

/** An AppError as the model reads it: its client-safe message, then its code. */
export function refusalText(err: AppError): string {
  return err.code ? `${err.message} (${err.code})` : err.message;
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
  const where = `mcp tool=${tool.name} conn=${ctx.auth.connectionId}`;
  try {
    const data = await tool.run(args, ctx);
    console.log(`${where} ms=${Date.now() - started} ok`);
    return text(JSON.stringify(envelope(ctx, data)));
  } catch (err) {
    if (err instanceof AppError) {
      console.log(`${where} ms=${Date.now() - started} refused`);
      return text(refusalText(err), true);
    }
    console.log(`${where} ms=${Date.now() - started} error`);
    console.error(where, failureOf(err));
    return text(GENERIC_ERROR, true);
  }
}
