import { Router, type Router as IRouter } from "express";
import { authRouter } from "./auth.js";
import { foodsRouter } from "./foods.js";
import { targetsRouter } from "./targets.js";
import { usersRouter } from "./users.js";

export const router: IRouter = Router();
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/targets", targetsRouter);
router.use("/foods", foodsRouter);
