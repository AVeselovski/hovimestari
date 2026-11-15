import { describe, expect, it, jest } from "@jest/globals";
import { EventEmitter } from "node:events";
import { format } from "node:util";
import { installLastResortHandlers } from "../lastResort.js";

// The process's last word on a failure nothing caught: logged as its stack,
// code and constraint, never the row values in a database error's detail,
// then the process exits 1 as Node would, so Fly restarts it clean.

function fakeProcess() {
  const proc = Object.assign(new EventEmitter(), { exit: jest.fn() });
  installLastResortHandlers(proc as unknown as NodeJS.Process);
  return proc;
}

const refused = () =>
  Object.assign(new Error('new row for relation "transactions" violates check constraint "x_check"'), {
    code: "23514",
    constraint: "x_check",
    detail: "Failing row contains (-987.65, Private Payee).",
  });

describe("installLastResortHandlers", () => {
  it.each(["unhandledRejection", "uncaughtException"])("logs a %s without row values, then exits 1", (event) => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const proc = fakeProcess();

    proc.emit(event, refused());

    const said = logged.mock.calls.map((c) => format(...c)).join("\n");
    expect(said).toContain(event);
    expect(said).toContain("code=23514 constraint=x_check");
    expect(said).not.toContain("Private Payee");
    expect(proc.exit).toHaveBeenCalledWith(1);
    logged.mockRestore();
  });

  it("logs a rejection that is not an Error without printing it", () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const proc = fakeProcess();

    proc.emit("unhandledRejection", { hidden: "value-to-hide" });

    expect(JSON.stringify(logged.mock.calls)).not.toContain("value-to-hide");
    expect(proc.exit).toHaveBeenCalledWith(1);
    logged.mockRestore();
  });
});
