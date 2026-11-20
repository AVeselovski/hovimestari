import { describe, expect, it } from "@jest/globals";
import { createRequire } from "node:module";
import { refuseNonLocal } from "../localOnly.js";

// The guard reads DATABASE_URL with WHATWG `URL`. pg reads the same string
// with pg-connection-string, and connects where that parser says. A URL the
// guard accepts must therefore name the same host, port and database to both
// parsers, or the guard proves one place safe while pg writes to another.
// pg-connection-string is loaded from pg's own dependencies, so this is the
// parser and the version pg runs.

const requireFromPg = createRequire(createRequire(import.meta.url).resolve("pg"));
const { parse } = requireFromPg("pg-connection-string") as {
  parse: (url: string) => { host?: string | null; port?: string | null; database?: string | null };
};

/** Where `URL` says the string points, written as pg-connection-string writes it. */
function asUrlReadsIt(databaseUrl: string) {
  const url = new URL(databaseUrl);
  return {
    host: url.hostname.replace(/^\[(.+)\]$/, "$1"),
    port: url.port,
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}

function asPgReadsIt(databaseUrl: string) {
  const parsed = parse(databaseUrl);
  return { host: parsed.host ?? "", port: parsed.port ?? "", database: parsed.database ?? "" };
}

// The guard's own cases, and spellings where the two parsers are known to
// differ: percent-escapes in the host and in the database name, a trailing
// dot, other spellings of the loopback address, a fragment and a backslash.
const CRAFTED = [
  "postgresql://postgres@localhost:5432/hovimestari_smoke",
  "postgresql://postgres@localhost/hovimestari_smoke",
  "postgres://postgres@127.0.0.1:5432/hovimestari_smoke",
  "postgresql://postgres@[::1]:5432/val4b_smoke",
  "postgresql://u@prod.example.com:5432/db_smoke?x=@localhost:1",
  "postgresql://postgres@localhost/x_smoke?host=db.example.com",
  "postgresql://postgres@localhost/x_smoke?hostaddr=10.0.0.1",
  "postgresql://postgres@localhost.example.com:5432/hovimestari_smoke",
  "postgresql://postgres@127.0.0.1.example.com/hovimestari_smoke",
  "postgresql://postgres@%2Fvar%2Frun%2Fpostgresql/hovimestari_smoke",
  "postgresql:///hovimestari_smoke",
  "postgresql://postgres@local%68ost/hovimestari_smoke",
  "postgresql://postgres@LOCALHOST/hovimestari_smoke",
  "postgresql://postgres@localhost./hovimestari_smoke",
  "postgresql://postgres@127.1/hovimestari_smoke",
  "postgresql://postgres@0x7f.0.0.1/hovimestari_smoke",
  "postgresql://postgres@[::ffff:127.0.0.1]/hovimestari_smoke",
  "postgresql://postgres@localhost\\@db.example.com/hovimestari_smoke",
  "postgresql://postgres@localhost/hovimestari_smoke#host=db.example.com",
  "postgresql://postgres@localhost/hovimestari%5Fsmoke",
  "postgresql://postgres@localhost/hovimestari%2F_smoke",
  "postgresql://postgres@localhost/hovimestari%3Fhost%3Ddb.example.com%26x=_smoke",
  "postgresql://postgres@localhost/prod%23_smoke",
  "postgresql://postgres@localhost/prod%20_smoke",
  "postgresql://postgres@localhost:05432/hovimestari_smoke",
];

describe("refuseNonLocal against pg's own parser", () => {
  it("accepts some of the crafted addresses, so the comparison below is not empty", () => {
    expect(CRAFTED.filter((url) => refuseNonLocal(url) === null).length).toBeGreaterThanOrEqual(4);
  });

  it.each(CRAFTED)("for %s, accepts only what pg reads as the same host, port and database", (url) => {
    // With and without the opt-out, confirmed with the name as the guard reads it.
    const confirmDatabase = URL.canParse(url) ? new URL(url).pathname.slice(1) : undefined;
    for (const anyDatabase of [false, true]) {
      if (refuseNonLocal(url, { anyDatabase, confirmDatabase }) !== null) continue;
      expect([anyDatabase, asPgReadsIt(url)]).toEqual([anyDatabase, asUrlReadsIt(url)]);
    }
  });
});
