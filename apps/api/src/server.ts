import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { stateRoutes } from "./routes/state.js";
import { pool } from "./db/pool.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN ?? "*",
  });
  await app.register(stateRoutes);
  app.addHook("onClose", async () => {
    await pool.end();
  });
  return app;
}
