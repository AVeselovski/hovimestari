/** @jest-environment node */
import nextConfig from "../../../next.config";

// The headers Next sends, read from the config it loads. The production build
// and the dev server are checked live in a browser, because only Next applies them.

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
});
