/** @jest-environment node */
import { requireSameOrigin } from "../_guard";
import { ORIGIN, browserRequest } from "./support";

const json = JSON.stringify({ email: "ada@example.com" });

describe("requireSameOrigin", () => {
  it("lets a same-origin JSON request through", () => {
    expect(requireSameOrigin(browserRequest("/api/auth/sign-in", { body: json }), { readsBody: true })).toBeNull();
  });

  it.each(["cross-site", "same-site", "none"])("refuses Sec-Fetch-Site: %s with 403", async (site) => {
    const res = requireSameOrigin(browserRequest("/api/auth/sign-in", { body: json, site }), { readsBody: true });
    expect(res?.status).toBe(403);
    expect(await res?.json()).toMatchObject({ code: "request_refused" });
  });

  it("without Sec-Fetch-Site, accepts this site's Origin", () => {
    const req = browserRequest("/api/auth/sign-in", { body: json, site: null, origin: ORIGIN });
    expect(requireSameOrigin(req, { readsBody: true })).toBeNull();
  });

  it("without Sec-Fetch-Site, accepts the Origin of the address the page was loaded from, not only the configured one", () => {
    // A phone on the same network loads the app from the machine's address over
    // plain http, where no browser sends Sec-Fetch-Site. Next's own idea of the
    // request's origin stays the configured one, so the guard compares against
    // the Host the browser sent instead.
    const lan = "192.168.1.131:3000";
    const req = browserRequest("/api/auth/sign-in", {
      body: json,
      site: null,
      origin: `http://${lan}`,
      headers: { host: lan },
    });
    expect(requireSameOrigin(req, { readsBody: true })).toBeNull();
  });

  it("without Sec-Fetch-Site, refuses an Origin on this host over another scheme", () => {
    const req = browserRequest("/api/auth/sign-in", { body: json, site: null, origin: "https://localhost:3000" });
    expect(requireSameOrigin(req, { readsBody: true })?.status).toBe(403);
  });

  it("without Sec-Fetch-Site, takes the scheme from x-forwarded-proto behind a proxy", () => {
    const host = "hovimestari.example";
    const req = browserRequest("/api/auth/sign-in", {
      body: json,
      site: null,
      origin: `https://${host}`,
      headers: { host, "x-forwarded-proto": "https" },
    });
    expect(requireSameOrigin(req, { readsBody: true })).toBeNull();
  });

  it("without Sec-Fetch-Site, refuses another Origin", () => {
    const req = browserRequest("/api/auth/sign-in", { body: json, site: null, origin: "https://evil.example" });
    expect(requireSameOrigin(req, { readsBody: true })?.status).toBe(403);
  });

  it("refuses a request with neither header", () => {
    const req = browserRequest("/api/auth/sign-in", { body: json, site: null });
    expect(requireSameOrigin(req, { readsBody: true })?.status).toBe(403);
  });

  it("refuses a text/plain body with 415, even when it holds valid JSON", () => {
    const req = browserRequest("/api/auth/sign-in", { body: json, contentType: "text/plain" });
    expect(requireSameOrigin(req, { readsBody: true })?.status).toBe(415);
  });

  it("refuses a missing content type where a body is read", () => {
    const req = browserRequest("/api/auth/sign-in", { body: json, contentType: undefined });
    req.headers.delete("content-type");
    expect(requireSameOrigin(req, { readsBody: true })?.status).toBe(415);
  });

  it("accepts JSON with a charset", () => {
    const req = browserRequest("/api/auth/sign-in", { body: json, contentType: "application/json; charset=utf-8" });
    expect(requireSameOrigin(req, { readsBody: true })).toBeNull();
  });

  it("lets a bodiless request through where no body is read, and refuses any other body type there", () => {
    expect(requireSameOrigin(browserRequest("/api/auth/refresh"), { readsBody: false })).toBeNull();
    const form = browserRequest("/api/auth/refresh", { body: "a=b", contentType: "application/x-www-form-urlencoded" });
    expect(requireSameOrigin(form, { readsBody: false })?.status).toBe(415);
  });
});
