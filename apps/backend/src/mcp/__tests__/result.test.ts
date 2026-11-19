import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { z } from "zod";
import { appError } from "../../lib/errors.js";
import { defineTool, envelope, GENERIC_ERROR, runTool, UNITS, type ToolContext } from "../result.js";
import { CONNECTION_ID, CONNECTION_NAME, TIME_ZONE, USER_ID } from "./harness.js";

// runTool shapes every tool's answer: the envelope on success, the app's
// refusal with its code, and a generic text for anything unexpected. Its one
// log line names the tool, the connection, the time and the outcome, and
// never an argument or a name.

const ctx: ToolContext = {
  read: {
    userId: USER_ID,
    db: {} as ToolContext["read"]["db"],
    now: new Date(0),
    timeZone: TIME_ZONE,
    today: "2026-11-19",
  },
  auth: {
    connectionId: CONNECTION_ID,
    connectionName: CONNECTION_NAME,
    userId: USER_ID,
    access: "read",
    expiresAt: "2026-12-19T10:00:00.000Z",
    timeZone: TIME_ZONE,
  },
  canWrite: false,
};

const echo = (run: () => Promise<unknown>) =>
  defineTool({ name: "echo_tool", description: "", inputSchema: z.strictObject({ privateArg: z.string() }), run });
const ARGS = { privateArg: "private-argument" };

afterEach(() => {
  jest.restoreAllMocks();
});

describe("runTool", () => {
  it("wraps the answer in the envelope, as one text block of compact JSON", async () => {
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await runTool(
      echo(async () => ({ figure: 1 })),
      ARGS,
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      today: "2026-11-19",
      timeZone: TIME_ZONE,
      units: UNITS,
      data: { figure: 1 },
    });
    expect(envelope(ctx, null)).toEqual({ today: "2026-11-19", timeZone: TIME_ZONE, units: UNITS, data: null });
  });

  it("logs one line naming the tool, the connection, the time and ok, never an argument or a name", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    await runTool(
      echo(async () => ({})),
      ARGS,
      ctx,
    );
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toMatch(new RegExp(`^mcp tool=echo_tool conn=${CONNECTION_ID} ms=\\d+ ok$`));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-argument|Claude on my laptop/);
  });

  it("answers the app's refusal as an error result with its code, logged as refused", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await runTool(
      echo(async () => {
        throw appError("target_change_not_found", 404);
      }),
      ARGS,
      ctx,
    );
    expect(result).toEqual({
      isError: true,
      content: [{ type: "text", text: "These targets no longer exist. (target_change_not_found)" }],
    });
    expect(log.mock.calls[0][0]).toMatch(/ refused$/);
  });

  it("answers anything else with the generic text and logs the failure, not the arguments", async () => {
    const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await runTool(
      echo(async () => {
        throw new Error("relation does not exist");
      }),
      ARGS,
      ctx,
    );
    expect(result).toEqual({ isError: true, content: [{ type: "text", text: GENERIC_ERROR }] });
    expect(log.mock.calls[0][0]).toMatch(/ error$/);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).toContain("relation does not exist");
    expect(JSON.stringify(logged.mock.calls)).not.toContain("private-argument");
  });
});
