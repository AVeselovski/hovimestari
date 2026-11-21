import { AxiosError, CanceledError, type AxiosResponse } from "axios";
import { AuthRequestError, getErrorCode, getErrorLine, getErrorStatus, getErrorValues } from "../errors";

function answered(status: number, data: unknown): AxiosError {
  return new AxiosError("failed", "ERR_BAD_REQUEST", undefined, undefined, { status, data } as AxiosResponse);
}

describe("getErrorCode", () => {
  it("reads a known code from an API answer", () => {
    expect(getErrorCode(answered(401, { message: "x", code: "invalid_credentials" }))).toBe("invalid_credentials");
  });

  it("ignores a code the API does not have", () => {
    expect(getErrorCode(answered(400, { code: "made_up" }))).toBeUndefined();
  });

  it("reads an unanswered request as the server out of reach, but not a cancel", () => {
    expect(getErrorCode(new AxiosError("Network Error", "ERR_NETWORK"))).toBe("server_unreachable");
    expect(getErrorCode(new CanceledError())).toBeUndefined();
    expect(getErrorCode(new TypeError("Failed to fetch"))).toBe("server_unreachable");
  });

  it("reads a route handler's refusal", async () => {
    const err = await AuthRequestError.from(new Response(JSON.stringify({ code: "email_taken" }), { status: 409 }));
    expect(getErrorCode(err)).toBe("email_taken");
    expect(getErrorStatus(err)).toBe(409);
  });

  it("survives a refusal without a JSON body", async () => {
    const err = await AuthRequestError.from(new Response("Bad gateway", { status: 502 }));
    expect(getErrorCode(err)).toBeUndefined();
    expect(getErrorStatus(err)).toBe(502);
  });
});

describe("getErrorValues", () => {
  it("reads the strings and numbers of an answer's details, and nothing else", () => {
    const details = { recipe: "Shakshuka", others: 2, recipes: ["Shakshuka", "Chili", "Puuro"], nested: { a: 1 } };
    expect(getErrorValues(answered(400, { code: "food_edit_recipe_too_large", details }))).toEqual({
      recipe: "Shakshuka",
      others: 2,
    });
  });

  it("is empty for an answer without details, and for an error that is not an answer", () => {
    expect(getErrorValues(answered(404, { code: "recipe_not_found" }))).toEqual({});
    expect(getErrorValues(answered(400, { details: "text" }))).toEqual({});
    expect(getErrorValues(new TypeError("Failed to fetch"))).toEqual({});
  });
});

describe("getErrorLine", () => {
  it("reads the line a refusal names, by its index from 0", () => {
    expect(getErrorLine(answered(404, { code: "food_not_found", line: 2 }))).toBe(2);
    expect(getErrorLine(answered(400, { code: "portion_not_found", line: 0 }))).toBe(0);
  });

  it("is undefined without a line, with a line that is no index, and for an error that is not an answer", () => {
    expect(getErrorLine(answered(400, { code: "name_required" }))).toBeUndefined();
    expect(getErrorLine(answered(400, { code: "food_not_found", line: "2" }))).toBeUndefined();
    expect(getErrorLine(answered(400, { code: "food_not_found", line: -1 }))).toBeUndefined();
    expect(getErrorLine(new TypeError("Failed to fetch"))).toBeUndefined();
  });
});
