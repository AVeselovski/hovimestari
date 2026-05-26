import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { stateRoutes } from "./routes/state.js";
import { recipesRoutes } from "./routes/recipes.js";
import { buildRouterFromEnv } from "./llm/index.js";
import { pool } from "./db/pool.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
  });
  const router = buildRouterFromEnv(app.log);
  await app.register(stateRoutes);
  await app.register(recipesRoutes, { router });
  app.addHook("onClose", async () => {
    await pool.end();
  });
  return app;
}
