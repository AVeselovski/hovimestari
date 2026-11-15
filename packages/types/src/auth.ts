import { z } from "zod";

export const RegisterBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).max(64),
});

export const LoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
});

export const ForgotPasswordBodySchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordBodySchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

export const UpdateProfileBodySchema = z
  .object({
    displayName: z.string().min(1).max(64).optional(),
    email: z.string().email().optional(),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided.",
  });

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const UserMeSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  hasPassword: z.boolean(),
  hasGoogle: z.boolean(),
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;
export type LoginBody = z.infer<typeof LoginBodySchema>;
export type RefreshBody = z.infer<typeof RefreshBodySchema>;
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;
export const LinkPasswordBodySchema = z.object({
  password: z.string().min(8),
});

export type AuthTokens = z.infer<typeof AuthTokensSchema>;
export type UserMe = z.infer<typeof UserMeSchema>;
export type LinkPasswordBody = z.infer<typeof LinkPasswordBodySchema>;

/**
 * A single-use ticket for a full-page navigation that must know who is
 * signed in, such as the start of a Google consent. It lives a minute and
 * rides in the navigation's `ticket` query parameter.
 */
export const NavigationTicketSchema = z.object({
  ticket: z.string(),
});
export type NavigationTicket = z.infer<typeof NavigationTicketSchema>;
