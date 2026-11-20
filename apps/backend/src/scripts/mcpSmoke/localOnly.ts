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
// - its database name is plain: letters, digits, `_`, `-` and `.`, with no
//   percent escape. pg-connection-string leaves some escapes as written and
//   decodes others, so an escaped name could be one database to this guard
//   and another to pg (`__tests__/localOnlyAgreesWithPg.test.ts`),
// - its database name ends in `_smoke`. A production database tunnelled to
//   localhost (fly proxy) looks local, so the name is what tells a database
//   made for the run from one that is not.
//
// The name rule has one way out, for one run at a time: with
// MCP_SMOKE_ANY_DATABASE=true, MCP_SMOKE_CONFIRM_DATABASE must repeat the
// database name exactly, whatever the name. The script prints the host and
// the name it is about to write to first, so the person sees what they
// confirm. Every other rule holds either way.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const PLAIN_NAME = /^[A-Za-z0-9_.-]+$/;

/** The opt-out of the name rule: the flag, and the name it must repeat. */
export interface AnyDatabase {
  anyDatabase: boolean;
  confirmDatabase?: string;
}

/** Where a URL points, as the script prints it before writing. */
export interface SmokeTarget {
  host: string;
  database: string;
}

/** The target of a URL the guard accepts, or the reason it refuses it. */
export function smokeTarget(
  databaseUrl: string | undefined,
  optOut: AnyDatabase = { anyDatabase: false },
): { target: SmokeTarget } | { refusal: string } {
  if (!databaseUrl) return { refusal: "DATABASE_URL is not set." };
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return { refusal: "DATABASE_URL is not a URL." };
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    return { refusal: "DATABASE_URL is not a postgres URL." };
  const host = url.hostname.replace(/^\[(.+)\]$/, "$1");
  if (!LOCAL_HOSTS.has(host)) return { refusal: "DATABASE_URL's host is not localhost, 127.0.0.1 or ::1." };
  if (url.search !== "") return { refusal: "DATABASE_URL has query parameters, which can name another host." };
  const database = url.pathname.slice(1);
  if (!PLAIN_NAME.test(database))
    return { refusal: "DATABASE_URL's database name is not only letters, digits, _, - and ., unescaped." };
  if (optOut.anyDatabase) {
    if (optOut.confirmDatabase !== database)
      return {
        refusal: `MCP_SMOKE_ANY_DATABASE=true needs MCP_SMOKE_CONFIRM_DATABASE set to the database name, exactly: ${database}`,
      };
  } else if (!database.endsWith("_smoke")) {
    return {
      refusal:
        "DATABASE_URL's database name does not end in _smoke. To use it for this run, set MCP_SMOKE_ANY_DATABASE=true and MCP_SMOKE_CONFIRM_DATABASE to its name.",
    };
  }
  return { target: { host, database } };
}

/** The reason a URL is refused, or null when it may be used. */
export function refuseNonLocal(databaseUrl: string | undefined, optOut?: AnyDatabase): string | null {
  const result = smokeTarget(databaseUrl, optOut);
  return "refusal" in result ? result.refusal : null;
}
