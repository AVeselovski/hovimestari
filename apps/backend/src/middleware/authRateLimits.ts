import type { ErrorCode } from "@hovimestari/types";
import type { Request } from "express";
import { MemoryStore, rateLimit } from "express-rate-limit";
import { createHash } from "node:crypto";
import { clientIp } from "../lib/clientIp.js";
import { ERROR_MESSAGES } from "../lib/errors.js";

// Rate limits on the auth endpoints a stranger can call: sign-in slows
// password guessing, sign-up and password reset slow email enumeration and
// mail sent in our name. Keyed on the client address (lib/clientIp.ts), and a
// failed sign-in also on the email it named, so ten wrong passwords for one
// account never lock out the other people behind the same address (a
// household, an office, a carrier's shared address). Sign-in and sign-up
// arrive relayed by the web server, which names the browser's address.
//
// Two more budgets guard what someone holding a session could guess at: the
// current password on a password change and the confirmation on deleting the
// account. They are keyed on the user and count failures only.
//
// Two things the next change has to keep in mind:
// - The stores are in memory, one per limiter per process, so the budgets are
//   per machine. With n Fly machines a client spread across them gets up to n
//   times each budget, and a restart clears them. A shared budget needs a
//   shared store (express-rate-limit's `store` option).
// - In production an unrelayed address is the Fly-Client-IP header
//   (lib/clientIp.ts). Behind any proxy that does not set it, every client
//   shares one budget.

const MINUTE = 60 * 1000;

export const AUTH_RATE_LIMITS = {
  /** Failed sign-ins per address and email. A successful one is given back. */
  login: { limit: 10, windowMs: 15 * MINUTE },
  /** Failed sign-ins per address, whatever email they named: guessing many accounts. */
  loginPerAddress: { limit: 100, windowMs: 15 * MINUTE },
  register: { limit: 10, windowMs: 60 * MINUTE },
  forgotPassword: { limit: 5, windowMs: 60 * MINUTE },
  /** Wrong current passwords on a password change, per user. */
  changePassword: { limit: 10, windowMs: 15 * MINUTE },
  /** Failed confirmations of deleting the account, per user. */
  deleteAccount: { limit: 10, windowMs: 15 * MINUTE },
} as const;

const stores: MemoryStore[] = [];

/** The longest email the sign-in schema can accept. */
const MAX_EMAIL_LENGTH = 254;

/**
 * The per-account sign-in key: the address and a SHA-256 of the body's email,
 * trimmed, in lower case and cut to the longest email there can be. A change
 * of letter case is the same account, and the key has one size whatever the
 * body sent, so a stream of huge made-up emails cannot fill the store. It runs
 * before the body is validated, so the email may be anything.
 */
export function loginKeyOf(req: Request): string {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH) : "";
  return `${clientIp(req)}|${createHash("sha256").update(email).digest("base64url")}`;
}

/** The signed-in user's key, for the budgets behind `authenticate`. */
const userKeyOf = (req: Request): string => `user|${req.user!.id}`;

function authLimiter(
  budget: { limit: number; windowMs: number },
  code: ErrorCode,
  {
    failuresOnly = false,
    keyGenerator = clientIp,
  }: { failuresOnly?: boolean; keyGenerator?: (req: Request) => string } = {},
) {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    ...budget,
    store,
    skipSuccessfulRequests: failuresOnly,
    keyGenerator,
    standardHeaders: "draft-6",
    legacyHeaders: false,
    // The address is the Fly header or the socket address, never X-Forwarded-For.
    validate: { xForwardedForHeader: false },
    message: { message: ERROR_MESSAGES[code], code },
  });
}

/**
 * The sign-in budgets. The route runs the address's first, so once an address
 * is over its cap no request from it reaches the per-account store, and an
 * address can open at most about 100 per-account entries a window. A request
 * the per-account limit refuses still counts toward the address cap.
 */
export const loginRateLimit = authLimiter(AUTH_RATE_LIMITS.login, "login_rate_limited", {
  failuresOnly: true,
  keyGenerator: loginKeyOf,
});
export const loginAddressRateLimit = authLimiter(AUTH_RATE_LIMITS.loginPerAddress, "login_network_rate_limited", {
  failuresOnly: true,
});
export const registerRateLimit = authLimiter(AUTH_RATE_LIMITS.register, "signup_rate_limited");
export const forgotPasswordRateLimit = authLimiter(AUTH_RATE_LIMITS.forgotPassword, "reset_rate_limited");
export const changePasswordRateLimit = authLimiter(AUTH_RATE_LIMITS.changePassword, "password_rate_limited", {
  failuresOnly: true,
  keyGenerator: userKeyOf,
});
export const deleteAccountRateLimit = authLimiter(AUTH_RATE_LIMITS.deleteAccount, "delete_rate_limited", {
  failuresOnly: true,
  keyGenerator: userKeyOf,
});

/** Clears every auth budget. The limiters live as long as the process, so a test suite starts each case clean. */
export async function resetAuthRateLimits(): Promise<void> {
  await Promise.all(stores.map((store) => store.resetAll()));
}
