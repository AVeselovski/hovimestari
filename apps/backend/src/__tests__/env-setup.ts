import { config } from "dotenv";
config({ path: ".env.test" });
// Route suites queue one membership read per request, so the cache is off
// under test whatever an older hand-copied .env.test says.
process.env.MEMBERSHIP_CACHE_TTL_MS ??= "0";

// The MCP SDK warns once per module load that json response mode drops
// mid-call notifications. No tool emits any, and every suite that imports the
// app would print it. Only that exact message is dropped. A stray warning's
// code frame now points here; its real caller is the next frame in its stack.
const MCP_JSON_MODE_WARNING =
  "responseMode: 'json' drops mid-call notifications. subscriptions/listen streams are always served over SSE regardless; other notifications emitted before a result are dropped.";
const warn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (args.length === 1 && args[0] === MCP_JSON_MODE_WARNING) return;
  warn(...args);
};
