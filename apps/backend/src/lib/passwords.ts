import { MAX_PASSWORD_BYTES } from "@hovimestari/types";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

/** bcrypt's cost. Each step doubles the work of one guess. */
export const BCRYPT_COST = 12;

/**
 * Whether bcrypt reads the whole password. It silently ignores every byte past
 * the 72nd, so two long passwords with the same first 72 bytes would match.
 * The body schemas refuse longer ones. This is the last guard before bcrypt.
 */
const fitsBcrypt = (password: string): boolean => Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;

export async function hashPassword(password: string): Promise<string> {
  if (!fitsBcrypt(password)) throw new Error("A password past 72 bytes reached hashPassword.");
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * A hash of a random password, made once at start-up. A sign-in for an
 * unknown address, or for an account with no password, is compared against
 * it, so every refused sign-in costs one bcrypt compare and the answer's
 * timing does not tell which addresses have a password.
 */
let dummyHash: Promise<string> | undefined;
function dummy(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_COST).catch((err: unknown) => {
    // Not cached: the next sign-in tries again instead of failing for as long as the process lives.
    dummyHash = undefined;
    throw err;
  });
  return dummyHash;
}
void dummy().catch(() => undefined);

/**
 * Whether `password` matches `hash`. With no stored hash it still pays one
 * compare, against the dummy, and answers false. A password past 72 bytes
 * never matches.
 */
export async function passwordMatches(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!fitsBcrypt(password)) return false;
  if (!hash) {
    await bcrypt.compare(password, await dummy());
    return false;
  }
  return bcrypt.compare(password, hash);
}
