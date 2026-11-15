import { randomUUID } from "node:crypto";

/** A password made at run time, so no test holds a literal one. */
export const testPassword = (): string => `pw-${randomUUID()}`;
