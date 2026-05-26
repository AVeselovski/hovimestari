import { buildServer } from "./server.js";
import { runMigrations } from "./db/migrate.js";

async function main(): Promise<void> {
  if (process.env.MIGRATE_ON_BOOT === "true") {
    await runMigrations();
  }
  const app = await buildServer();
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen({ host: "0.0.0.0", port });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      app.log.info({ signal }, "shutting down");
      app.close().catch((err) => {
        app.log.error(err, "error during shutdown");
        process.exit(1);
      });
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
