import { AxiosError, CanceledError, type AxiosResponse } from "axios";
import { AuthRequestError, getErrorCode, getErrorStatus } from "../errors";

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
