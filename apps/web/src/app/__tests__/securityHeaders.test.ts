/** @jest-environment node */
import nextConfig from "../../../next.config";

// The headers Next sends, read from the config it loads. The production build
// and the dev server are checked live in a browser, because only Next applies them.
//
// There is no `script-src` today. A future one must carry 'wasm-unsafe-eval',
// or the browser refuses to compile the barcode scanner's WebAssembly decoder
// (components/foods/scanner/decoder.ts), and the scanner says it did not load.

async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const out: Record<string, string> = {};
  for (const rule of rules) {
    const matches = rule.source === "/:path*" || rule.source === path;
    if (matches) for (const { key, value } of rule.headers) out[key] = value;
  }
  return out;
}

describe("security headers", () => {
  it.each(["/", "/auth/sign-in", "/auth/reset-password"])("forbid framing %s", async (path) => {
    const headers = await headersFor(path);
    expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(headers["X-Frame-Options"]).toBe("DENY");
  });

  it("apply the framing rule to every route", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const everyRoute = rules.find((rule) => rule.source === "/:path*");
    expect(everyRoute?.headers.map((h) => h.key)).toEqual(
      expect.arrayContaining(["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options"]),
    );
  });

  // A later hardening pass that switched the camera off would break the barcode
  // scanner in silence: the browser refuses getUserMedia as if the person had.
  it.each(["/", "/auth/sign-in"])("let %s use the camera, and nothing else of the device", async (path) => {
    const headers = await headersFor(path);
    expect(headers["Permissions-Policy"]).toBe("camera=(self), microphone=(), geolocation=()");
  });

  it("send no script-src, or one that lets the scanner compile its WebAssembly", async () => {
    const policy = (await headersFor("/"))["Content-Security-Policy"] ?? "";
    const scriptSrc = policy.split(";").find((d) => d.trim().startsWith("script-src"));
    if (scriptSrc !== undefined) expect(scriptSrc).toContain("'wasm-unsafe-eval'");
  });
});
