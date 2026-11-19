import type { CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { appError, AppError } from "../../../lib/errors.js";
import { failureOf } from "../../../lib/failureOf.js";
import {
  countRecentChanges,
  findReplay,
  replayAfterConflict,
  requestHashOf,
  RequestKeyTaken,
  type AssistantActor,
  type RecordedOutcome,
  type Replay,
} from "../../../services/writes/changeRecord.js";
import { envelope, refusalText, text, toolLine, type ToolContext, type ToolOutcome } from "../../result.js";
import { CHANGES_PER_HOUR, HOUR_MS, writesPerMinute } from "../../writeBrake.js";

// ---------------------------------------------------------------------------
// How every write tool runs (design d.4), lifted from finanssiappisV2's
// mcp/tools/writes/run.ts: the per-minute brake, the actor built from the
// key and the call, the request-key replay, the hourly brake for a call that
// is not a retry, then the tool's one recorded service. The outcome comes
// from the record, never from the service. A tool validates its input,
// calls one function from services/writes/recorded/ and selects fields from
// its answer. It runs no SQL and computes nothing.
// ---------------------------------------------------------------------------

/** What a write tool body gets: the call's service context, and the connection as the actor, with the call's request key and hash. */
export interface WriteToolContext {
  service: ToolContext["service"];
  via: AssistantActor;
}

/** A write tool's answer before the note: the outcome and the fields it selected from the service's answer. */
export interface WriteToolData {
  outcome: RecordedOutcome;
  data: Record<string, unknown>;
}

export interface WriteTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  inputSchema: S;
  /** The spec's destructiveHint: true for a tool that may change or remove what is there, false for one that only adds. */
  destructive: boolean;
  run: (args: z.output<S>, ctx: WriteToolContext) => Promise<WriteToolData>;
  /** What a retry answers: the thing as it is now, read by the record's ids through read services. */
  replay: (service: ToolContext["service"], replay: Replay) => Promise<Record<string, unknown>>;
}

/** Keeps the args type of each tool while letting the set be one array. */
export function defineWriteTool<S extends z.ZodObject>(tool: WriteTool<S>): WriteTool<S> {
  return tool;
}

export const WRITE_GENERIC_ERROR =
  "Something went wrong. Send the same call again with the same requestKey. If the change was saved, the app returns it and saves nothing twice.";

const RECORDED = "Recorded in the app under this connection's name.";
const NOTES: Record<RecordedOutcome | "replayed", string> = {
  created: RECORDED,
  changed: RECORDED,
  deleted: RECORDED,
  unchanged: "Nothing changed. Nothing was recorded.",
  replayed: "An earlier call with this requestKey already made this change. Nothing new was written.",
};

/** The per-minute brake, per user. In memory, so it runs first and guards the database reads after it. */
function brakePerMinute(ctx: ToolContext): void {
  if (!writesPerMinute.admit(ctx.auth.userId, ctx.service.now.getTime())) {
    throw appError("assistant_writes_per_minute", 429);
  }
}

/** The hourly brake, per user across every key, counted from the record. */
async function brakePerHour(ctx: ToolContext): Promise<void> {
  const since = new Date(ctx.service.now.getTime() - HOUR_MS);
  if ((await countRecentChanges(ctx.service, since)) >= CHANGES_PER_HOUR) {
    throw appError("assistant_changes_per_hour", 429);
  }
}

/** A replay as the model reads it: what the first call recorded, and the thing as it is now. */
/** The answer's data before its note. */
type Answer = { outcome: RecordedOutcome | "replayed" } & Record<string, unknown>;

async function replayed(tool: WriteTool, ctx: ToolContext, replay: Replay): Promise<Answer> {
  return {
    outcome: "replayed" as const,
    firstCallAt: replay.createdAt.toISOString(),
    recorded: replay.summary,
    ...(await tool.replay(ctx.service, replay)),
  };
}

/**
 * Runs one write tool and shapes its answer. A brake, a request key reused
 * for another change and the app refusing all come back as an error result
 * with the app's own words and code. Anything else is logged and answered
 * with a message that tells the model to retry with the same key, which is
 * safe on either side of the commit, because a committed change has its
 * record row and its key. The log line never carries the arguments, the
 * request key or a name.
 */
export async function runWriteTool<S extends z.ZodObject>(
  tool: WriteTool<S>,
  args: z.output<S> & { requestKey: string },
  ctx: ToolContext,
): Promise<CallToolResult> {
  const started = Date.now();
  const line = (outcome: ToolOutcome) =>
    console.log(toolLine(tool.name, ctx.auth.connectionId, Date.now() - started, outcome));
  try {
    brakePerMinute(ctx);
    const via: AssistantActor = {
      connectionId: ctx.auth.connectionId,
      connectionName: ctx.auth.connectionName,
      requestKey: args.requestKey,
      requestHash: requestHashOf(tool.name, args),
    };
    // A retry is answered before the hourly brake, so the call that was the
    // hour's last change can still learn that it landed.
    const earlier = await findReplay(ctx.service, via);
    let data: Answer;
    if (earlier) {
      data = await replayed(tool as WriteTool, ctx, earlier);
    } else {
      await brakePerHour(ctx);
      try {
        const done = await tool.run(args, { service: ctx.service, via });
        data = { outcome: done.outcome, ...done.data };
      } catch (err) {
        // Another call with this key committed while this one ran, and this one rolled back.
        if (!(err instanceof RequestKeyTaken)) throw err;
        data = await replayed(tool as WriteTool, ctx, await replayAfterConflict(ctx.service, via, err));
      }
    }
    const { outcome } = data;
    line(outcome === "replayed" || outcome === "unchanged" ? outcome : "ok");
    return text(JSON.stringify(envelope(ctx, { ...data, note: NOTES[outcome] })));
  } catch (err) {
    if (err instanceof AppError) {
      line("refused");
      return text(refusalText(err), true);
    }
    line("error");
    console.error(`mcp tool=${tool.name} conn=${ctx.auth.connectionId}`, failureOf(err));
    return text(WRITE_GENERIC_ERROR, true);
  }
}
