import { z } from "zod";

/** The longest password bcrypt reads, in UTF-8 bytes. It ignores every byte past it. */
export const MAX_PASSWORD_BYTES = 72;
/** The shortest password an account may set, in characters. */
export const MIN_PASSWORD_LENGTH = 8;

const fitsBcrypt = (p: string) => new TextEncoder().encode(p).length <= MAX_PASSWORD_BYTES;

/** Trimmed and lower-cased before it is checked, so every lookup and every stored email is normalised. */
const Email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "invalid_email" }));

const Password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, { error: "password_too_short" })
  .refine(fitsBcrypt, { error: "password_too_long" });

// Capped at 72 bytes on sign-in too: bcrypt reads only the first 72, so a
// longer input that starts with the stored password would otherwise match it.
const LoginPassword = z.string().min(1).refine(fitsBcrypt, { error: "password_too_long" });

export const RegisterBodySchema = z.object({ email: Email, password: Password });
export const LoginBodySchema = z.object({ email: Email, password: LoginPassword });
export const RefreshBodySchema = z.object({ refreshToken: z.string().min(1) });
export const GoogleExchangeBodySchema = z.object({ code: z.string().min(1), nonce: z.string().min(1) });
export const ForgotPasswordBodySchema = z.object({ email: Email });
export const ResetPasswordBodySchema = z.object({ token: z.string().min(1), newPassword: Password });
export const LinkPasswordBodySchema = z.object({ password: Password });
export const ChangePasswordBodySchema = z.object({ currentPassword: z.string().min(1), newPassword: Password });
/** A password account confirms with its password, a Google-only account with its email. */
export const DeleteAccountBodySchema = z.union([z.object({ password: z.string().min(1) }), z.object({ email: Email })]);

/** The signed-in user. */
export const MeSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  hasPassword: z.boolean(),
  hasGoogle: z.boolean(),
});

/** What a token-issuing route answers. Only the web server ever receives it. */
export const SessionGrantSchema = z.object({ accessToken: z.string(), refreshToken: z.string(), user: MeSchema });
/** What a web route handler hands the browser: never the refresh token. */
export const BrowserSessionSchema = z.object({ accessToken: z.string(), user: MeSchema });
export const AuthProvidersSchema = z.object({ google: z.boolean() });
/** The SHA-256 of the web app's nonce, in hex. */
export const GoogleLinkStartBodySchema = z.object({ bind: z.string().regex(/^[0-9a-f]{64}$/) });
export const GoogleLinkStartSchema = z.object({ url: z.url() });

export type RegisterBody = z.infer<typeof RegisterBodySchema>;
export type LoginBody = z.infer<typeof LoginBodySchema>;
export type RefreshBody = z.infer<typeof RefreshBodySchema>;
export type GoogleExchangeBody = z.infer<typeof GoogleExchangeBodySchema>;
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;
export type LinkPasswordBody = z.infer<typeof LinkPasswordBodySchema>;
export type ChangePasswordBody = z.infer<typeof ChangePasswordBodySchema>;
export type DeleteAccountBody = z.infer<typeof DeleteAccountBodySchema>;
export type Me = z.infer<typeof MeSchema>;
export type SessionGrant = z.infer<typeof SessionGrantSchema>;
export type BrowserSession = z.infer<typeof BrowserSessionSchema>;
export type AuthProviders = z.infer<typeof AuthProvidersSchema>;
export type GoogleLinkStartBody = z.infer<typeof GoogleLinkStartBodySchema>;
export type GoogleLinkStart = z.infer<typeof GoogleLinkStartSchema>;
