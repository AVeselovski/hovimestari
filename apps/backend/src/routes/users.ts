import { ChangePasswordBodySchema, DeleteAccountBodySchema, SettingsBodySchema } from "@hovimestari/types";
import { eq } from "drizzle-orm";
import { Router, type Router as IRouter } from "express";
import { db } from "../db/index.js";
import { users } from "../db/schema/index.js";
import { appError } from "../lib/errors.js";
import { parseBody } from "../lib/parseBody.js";
import { hashPassword, passwordMatches } from "../lib/passwords.js";
import { contextFor } from "../lib/requestContext.js";
import { endAllSessions, meOf } from "../lib/sessions.js";
import { findUser } from "../lib/users.js";
import { authenticate } from "../middleware/authenticate.js";
import { changePasswordRateLimit, deleteAccountRateLimit } from "../middleware/authRateLimits.js";
import { updateSettings } from "../services/writes/settings.js";

export const usersRouter: IRouter = Router();

// GET /me
usersRouter.get("/me", authenticate, async (req, res) => {
  const user = await findUser(req.user!.id);
  if (!user) throw appError("user_not_found", 404);
  res.status(200).json(meOf(user));
});

// PATCH /me/settings. The food-name language, the time zone, or both.
usersRouter.patch("/me/settings", authenticate, async (req, res) => {
  const body = parseBody(SettingsBodySchema, req.body);
  const { value } = await updateSettings(await contextFor(req), body);
  res.status(200).json(meOf(value));
});

// PUT /me/password. Ends every session: the web app signs this device back in with the new password.
usersRouter.put("/me/password", authenticate, changePasswordRateLimit, async (req, res) => {
  const { currentPassword, newPassword } = parseBody(ChangePasswordBodySchema, req.body);
  const userId = req.user!.id;

  const user = await findUser(userId);
  if (!user) throw appError("user_not_found", 404);
  if (!user.passwordHash) throw appError("no_password", 403);
  if (!(await passwordMatches(currentPassword, user.passwordHash))) throw appError("current_password_wrong", 401);

  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
    // A stolen refresh token cannot outlive the password it was issued under.
    await endAllSessions(tx, userId);
  });

  res.status(204).send();
});

// DELETE /me. Deletes the account and, by cascade, everything it owns.
usersRouter.delete("/me", authenticate, deleteAccountRateLimit, async (req, res) => {
  const body = parseBody(DeleteAccountBodySchema, req.body);
  const userId = req.user!.id;

  const user = await findUser(userId);
  if (!user) throw appError("user_not_found", 404);

  // An account with a password confirms with it. Only a Google-only account may confirm with its email.
  const confirmed = user.passwordHash
    ? "password" in body && (await passwordMatches(body.password, user.passwordHash))
    : "email" in body && body.email === user.email;
  if (!confirmed) throw appError("confirmation_mismatch", 400);

  // One statement: Postgres cascades it to every row the account owns.
  await db.delete(users).where(eq(users.id, userId));

  res.status(204).send();
});
