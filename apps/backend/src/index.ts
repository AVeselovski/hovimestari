import "dotenv/config";
import { app } from "./app.js";
import { env } from "./lib/env.js";
import { installLastResortHandlers } from "./lib/lastResort.js";
import { startRuntimeStatsLog } from "./lib/runtimeStats.js";

installLastResortHandlers();

const server = app.listen(env.PORT, () => {
  console.log(`Backend running on port ${env.PORT}`);
});

// Longer than the Fly proxy's idle timeout (75s in fly.toml), so the proxy
// always closes an idle connection first and never reuses one Node has just
// closed, which would surface as a sporadic 502.
server.keepAliveTimeout = 76_000;
server.headersTimeout = 77_000;

startRuntimeStatsLog();
