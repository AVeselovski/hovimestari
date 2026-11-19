// The smoke check writes to the database it is given: it signs up a user,
// writes as it and deletes it. This guard lets it run only on a database it
// can prove is a throwaway one on this machine.
//
// A URL passes when all of these hold:
// - it is a postgres: or postgresql: URL,
// - its hostname is exactly localhost, 127.0.0.1 or ::1 (a socket path, an
//   empty host or any other name cannot be proved local),
// - it has no query parameters at all, since pg reads a `host` parameter over
//   the URL's own host, and a local smoke URL needs none,
// - its database name ends in `_smoke`, unless `anyDatabase` is set. A
//   production database tunnelled to localhost (fly proxy) looks local, so
//   the name is what tells a database made for the run from one that is not.
//
// Answers the reason a URL is refused, or null when it may be used.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function refuseNonLocal(databaseUrl: string | undefined, anyDatabase = false): string | null {
  if (!databaseUrl) return "DATABASE_URL is not set.";
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return "DATABASE_URL is not a URL.";
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return "DATABASE_URL is not a postgres URL.";
  const host = url.hostname.replace(/^\[(.+)\]$/, "$1");
  if (!LOCAL_HOSTS.has(host)) return "DATABASE_URL's host is not localhost, 127.0.0.1 or ::1.";
  if (url.search !== "") return "DATABASE_URL has query parameters, which can name another host.";
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!anyDatabase && !database.endsWith("_smoke"))
    return "DATABASE_URL's database name does not end in _smoke. Set MCP_SMOKE_ANY_DATABASE=true to use it anyway.";
  return null;
}
