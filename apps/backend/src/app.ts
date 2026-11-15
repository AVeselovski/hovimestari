import cors from "cors";
import { sql } from "drizzle-orm";
import express, { type Express } from "express";
import passport from "passport";
import { db } from "./db/index.js";
import { env } from "./lib/env.js";
import "./lib/passport.js";
import { mcpRouter } from "./mcp/router.js";
import { errorHandler } from "./middleware/error.js";
import { requestLog } from "./middleware/requestLog.js";
import { router } from "./routes/index.js";

export const app: Express = express();

// The MCP endpoint for connected AI clients. Mounted before CORS and the JSON
// parser: it has its own parser, answers browsers 403 and sends no CORS
// headers. With MCP_ENABLED=false it is not mounted at all, so /mcp is a 404.
if (env.MCP_ENABLED) app.use("/mcp", mcpRouter);

// `CORS_ORIGIN` may name several origins, comma separated. Production sets
// one; local development often needs two at once — `localhost` for the
// browser on this machine and the machine's LAN address for a phone on the
// same network, which is the only way to test a touch layout on real
// hardware. A single value still behaves exactly as before.
const allowedOrigins = env.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);
// `maxAge` lets the browser reuse a preflight per URL for 2 hours (Chrome's
// cap) instead of the 5s default.
app.use(cors({ origin: allowedOrigins, credentials: true, maxAge: 7200 }));
if (env.NODE_ENV !== "test") app.use(requestLog());
app.use(express.json());
app.use(passport.initialize());

// Liveness: the process is up and serving HTTP. Never touches the database,
// so a busy pool cannot take the machine out of Fly's routing.
app.get("/livez", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Readiness: the database answers. For monitoring, not routing.
app.get("/health", async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).json({ status: "ok", db: "ok" });
  } catch {
    // 503 so the monitoring check shows the database as down.
    res.status(503).json({ status: "error", db: "error" });
  }
});

app.use("/api/v1", router);
app.use(errorHandler);
