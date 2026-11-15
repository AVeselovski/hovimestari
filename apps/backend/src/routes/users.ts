import { UpdateProfileBodySchema } from "@finanssiappis/types";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { Router, type Router as IRouter } from "express";
import { db } from "../db/index.js";
import { refreshTokens, users } from "../db/schema/index.js";
import { revokeUserAccessTokens } from "../lib/accessTokens.js";
import { AppError } from "../lib/errors.js";
import { authenticate } from "../middleware/authenticate.js";

export const usersRouter: IRouter = Router();

// GET /me
usersRouter.get("/me", authenticate, async (req, res) => {
  const userId = req.user!.id;

  const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (found.length === 0) {
    throw new AppError("User not found.", 404);
  }

  const user = found[0];
  res.status(200).json({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    hasPassword: user.passwordHash !== null,
    hasGoogle: user.googleId !== null,
  });
});

// PATCH /me
usersRouter.patch("/me", authenticate, async (req, res) => {
  const body = UpdateProfileBodySchema.safeParse(req.body);
  if (!body.success) {
    throw new AppError(body.error.errors[0].message, 400);
  }

  const userId = req.user!.id;
  const { displayName, email, currentPassword, newPassword } = body.data;

  const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  if (found.length === 0) {
    throw new AppError("User not found.", 404);
  }

  const user = found[0];
  const updates: Partial<typeof user> = { updatedAt: new Date() };

  if (displayName !== undefined) {
    updates.displayName = displayName;
  }

  if (email !== undefined) {
    if (!user.passwordHash) {
      throw new AppError("Email can only be changed on password-based accounts.", 403);
    }
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0 && existing[0].id !== userId) {
      throw new AppError("Email is already in use.", 409);
    }
    updates.email = email;
  }

  if (newPassword !== undefined) {
    if (!user.passwordHash) {
      throw new AppError("Password can only be changed on password-based accounts.", 403);
    }
    if (!currentPassword) {
      throw new AppError("Current password is required to set a new password.", 400);
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new AppError("Current password is incorrect.", 401);
    }
    updates.passwordHash = await bcrypt.hash(newPassword, 12);
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set(updates).where(eq(users.id, userId));

    // A password change ends every session and every AI connection the user
    // made, so a stolen refresh token, or a vault access token minted by
    // someone who briefly held the account, cannot outlive it.
    if (updates.passwordHash !== undefined) {
      await tx.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
      await revokeUserAccessTokens(tx, userId);
    }
  });

  const updated = await db.select().from(users).where(eq(users.id, userId)).limit(1);

  const u = updated[0];
  res.status(200).json({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    hasPassword: u.passwordHash !== null,
    hasGoogle: u.googleId !== null,
  });
});
