import type { RequestHandler } from "express";
import { ERROR_MESSAGES } from "../lib/errors.js";
import { verifyAccessToken } from "../lib/jwt.js";

const UNAUTHORIZED = { message: ERROR_MESSAGES.unauthorized, code: "unauthorized" } as const;

export const authenticate: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json(UNAUTHORIZED);
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub };
    next();
  } catch {
    res.status(401).json(UNAUTHORIZED);
  }
};
