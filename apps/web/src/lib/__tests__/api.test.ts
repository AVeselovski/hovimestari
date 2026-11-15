import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { api, injectAuthHandlers } from "../api";

// Drives the real interceptors with an adapter in place of the network.

let token: string | null;
const renewSession = jest.fn<Promise<boolean>, []>();
const seen: Array<string | undefined> = [];

function respond(config: InternalAxiosRequestConfig, status: number): ReturnType<AxiosAdapter> {
  const response = { data: {}, status, statusText: "", headers: {}, config };
  if (status >= 400) {
    return Promise.reject(new AxiosError("failed", "ERR_BAD_REQUEST", config, undefined, response));
  }
  return Promise.resolve(response);
}

beforeEach(() => {
  token = "first";
  seen.length = 0;
  renewSession.mockReset();
  injectAuthHandlers({ getAccessToken: () => token, renewSession });
});

function adapter(statusFor: (bearer: string | undefined) => number): AxiosAdapter {
  return (config) => {
    const bearer = AxiosHeaders.from(config.headers).get("Authorization") as string | undefined;
    seen.push(bearer);
    return respond(config, statusFor(bearer));
  };
}

describe("the API client", () => {
  it("sends the in-memory access token as a bearer", async () => {
    await api.get("/users/me", { adapter: adapter(() => 200) });
    expect(seen).toEqual(["Bearer first"]);
  });

  it("on a 401, renews the session once and retries with the new token", async () => {
    renewSession.mockImplementation(async () => {
      token = "second";
      return true;
    });
    const res = await api.get("/users/me", { adapter: adapter((b) => (b === "Bearer second" ? 200 : 401)) });
    expect(res.status).toBe(200);
    expect(renewSession).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["Bearer first", "Bearer second"]);
  });

  it("returns the 401 when the session cannot be renewed, and does not loop", async () => {
    renewSession.mockResolvedValue(false);
    await expect(api.get("/users/me", { adapter: adapter(() => 401) })).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(seen).toHaveLength(1);
  });

  it("does not renew on any other refusal", async () => {
    await expect(api.get("/users/me", { adapter: adapter(() => 403) })).rejects.toBeInstanceOf(AxiosError);
    expect(renewSession).not.toHaveBeenCalled();
  });
});
