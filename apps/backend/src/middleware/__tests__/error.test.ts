import { describe, expect, it, jest } from "@jest/globals";
import express, { type NextFunction, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { format } from "node:util";
import request from "supertest";
import { AppError } from "../../lib/errors.js";
import { errorHandler } from "../error.js";

function mockRes() {
  const res = {
    status: jest.fn<(code: number) => Response>(),
    json: jest.fn<(body: unknown) => Response>(),
    set: jest.fn<(name: string, value: string) => Response>(),
  };
  res.status.mockReturnValue(res as unknown as Response);
  res.set.mockReturnValue(res as unknown as Response);
  return res;
}

const req = {} as Request;

/** A failed query as drizzle wraps it: the SQL and params in the message and fields, the driver error as `cause`. */
function wrapped(driver: { code?: string; constraint?: string }, message: string, params: unknown[] = []): Error {
  const cause = Object.assign(new Error(message), driver);
  return Object.assign(new Error(`Failed query: insert into foods values ($1)\nparams: ${params.join(",")}`), {
    query: "insert into foods values ($1)",
    params,
    cause,
  });
}
const next = jest.fn() as unknown as NextFunction;

describe("errorHandler", () => {
  it("passes an AppError through with its status", () => {
    const res = mockRes();
    jest.spyOn(console, "error").mockImplementation(() => {});
    errorHandler(new AppError("Not found", 404), req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Not found" });
  });

  it("sends an AppError's code beside its message", () => {
    const res = mockRes();
    errorHandler(
      new AppError("Invalid email or password.", 401, { code: "invalid_credentials" }),
      req,
      res as unknown as Response,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid email or password.", code: "invalid_credentials" });
  });

  it.each([
    [
      "a cancelled statement",
      Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" }),
    ],
    [
      "a lock wait that gave up",
      Object.assign(new Error("canceling statement due to lock timeout"), { code: "55P03" }),
    ],
    [
      "a lock wait that gave up, as drizzle wraps it",
      wrapped({ code: "55P03" }, "canceling statement due to lock timeout"),
    ],
    ["a client-side query timeout, as drizzle wraps it", wrapped({}, "Query read timeout")],
    ["a pool connect timeout", new Error("timeout exceeded when trying to connect")],
    ["a client-side query timeout", new Error("Query read timeout")],
  ])("answers 503 with Retry-After for %s", (_label, err) => {
    const res = mockRes();
    jest.spyOn(console, "error").mockImplementation(() => {});
    errorHandler(err, req, res as unknown as Response, next);
    expect(res.set).toHaveBeenCalledWith("Retry-After", "2");
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ message: "The server is busy. Please try again." });
  });

  it("logs a wrapped busy error's driver message, never the wrapper's query params", () => {
    const res = mockRes();
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const param = `param-${randomUUID()}`;
    errorHandler(
      wrapped({ code: "55P03" }, "canceling statement due to lock timeout", [param]),
      req,
      res as unknown as Response,
      next,
    );
    const said = logged.mock.calls.map((c) => format(...c)).join("\n");
    expect(said).toContain("55P03 canceling statement due to lock timeout");
    expect(said).not.toContain(param);
    logged.mockRestore();
  });

  it.each([
    ["a refused row", { code: "23505", constraint: "some_unmapped_key" }, "duplicate key value"],
    ["a dropped connection", {}, "Connection terminated unexpectedly"],
  ])(
    "never reads a busy phrase from a wrapped query's params as busy, for %s, and logs none of them",
    (_l, driver, message) => {
      const res = mockRes();
      const logged = jest.spyOn(console, "error").mockImplementation(() => {});
      // A food named after a busy phrase, in an INSERT that failed.
      const param = `Query read timeout ${randomUUID()}`;
      errorHandler(wrapped(driver, message, [param]), req, res as unknown as Response, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.set).not.toHaveBeenCalled();
      const said = logged.mock.calls.map((c) => format(...c)).join("\n");
      expect(said).not.toContain(param);
      logged.mockRestore();
    },
  );

  it("judges a Postgres error by its code, even when its message quotes a busy phrase, and logs none of the input", () => {
    const res = mockRes();
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const input = `Query read timeout ${randomUUID()}`;
    const refused = Object.assign(new Error(`invalid input syntax for type uuid: "${input}"`), { code: "22P02" });
    errorHandler(refused, req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(500); // before: 503, the message matched a busy phrase
    expect(res.set).not.toHaveBeenCalled();
    const said = logged.mock.calls.map((c) => format(...c)).join("\n");
    expect(said).toContain("code=22P02");
    expect(said).not.toContain(input);
    logged.mockRestore();
  });

  it("keeps every other error a 500 without details", () => {
    const res = mockRes();
    jest.spyOn(console, "error").mockImplementation(() => {});
    errorHandler(Object.assign(new Error("boom"), { code: "23505" }), req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: "Internal server error" });
    expect(res.set).not.toHaveBeenCalled();
  });

  it("logs a database error's stack, code and constraint, never the row values in its detail", () => {
    const res = mockRes();
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const refused = Object.assign(new Error('new row for relation "users" violates check constraint "x_check"'), {
      code: "23514",
      constraint: "x_check",
      detail: "Failing row contains (row-value-to-hide, google-subject).",
    });
    errorHandler(refused, req, res as unknown as Response, next);
    const said = logged.mock.calls.map((c) => format(...c)).join("\n");
    expect(said).toContain("violates check constraint");
    expect(said).toContain("code=23514 constraint=x_check");
    expect(said).not.toContain("row-value-to-hide");
    expect(res.status).toHaveBeenCalledWith(500);
    logged.mockRestore();
  });
});

describe("errorHandler with the JSON body parser", () => {
  const app = express();
  app.use(express.json());
  app.post("/echo", (req, res) => {
    res.json(req.body);
  });
  app.use(errorHandler);

  it("answers malformed JSON 400 and logs nothing of the body", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const bodyValue = `body-${randomUUID()}`;
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send(`{"note": "${bodyValue}",`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "The request body is not valid JSON.", code: "invalid_request" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(bodyValue);
    logged.mockRestore();
  });

  it("answers a body over the limit 413", async () => {
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app)
      .post("/echo")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ note: "x".repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ message: "The request body is too large.", code: "invalid_request" });
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("answers another unreadable body with its own 4xx", async () => {
    const res = await request(app).post("/echo").set("Content-Type", "application/json; charset=klingon").send("{}");
    expect(res.status).toBe(415);
    expect(res.body).toEqual({ message: "The request body could not be read.", code: "invalid_request" });
  });
});
