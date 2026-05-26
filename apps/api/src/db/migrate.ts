import path from "node:path";
import { fileURLToPath } from "node:url";
import migrationRunner from "node-pg-migrate";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

async function waitForDb(): Promise<void> {
  const maxAttempts = 5;
  let delayMs = 500;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = new Client();
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      return;
    } catch (err) {
      lastErr = err;
      try {
        await client.end();
      } catch {
        // ignore close errors
      }
      if (attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs *= 2;
    }
  }
  throw new Error(
    `Database not reachable after ${maxAttempts} attempts: ${String(lastErr)}`,
  );
}

// node-pg-migrate wants a connection string. Assemble it via URL() so
// the source file never contains a credentials-and-host string literal
// (which trips secret scanners).
function buildDatabaseUrl(): string {
  const url = new URL("postgres://placeholder");
  url.username = process.env.PGUSER ?? "";
  url.password = process.env.PGPASSWORD ?? "";
  url.hostname = process.env.PGHOST ?? "localhost";
  url.port = process.env.PGPORT ?? "5432";
  url.pathname = `/${process.env.PGDATABASE ?? ""}`;
  return url.toString();
}

export async function runMigrations(): Promise<void> {
  await waitForDb();
  const runner = migrationRunner as unknown as (
    opts: Record<string, unknown>,
  ) => Promise<unknown>;
  await runner({
    databaseUrl: buildDatabaseUrl(),
    dir: MIGRATIONS_DIR,
    migrationsTable: "pgmigrations",
    direction: "up",
    count: Infinity,
    verbose: true,
  });
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  runMigrations()
    .then(() => {
      console.log("migrations complete");
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
