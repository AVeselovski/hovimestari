import { z } from "zod";

/**
 * A calendar date, `YYYY-MM-DD`, that exists. Year 0 is refused too, because
 * Postgres has no year 0 and would fail the query instead of answering 400.
 */
export const IsoDateSchema = z.iso
  .date({ error: "invalid_date" })
  .refine((s) => !s.startsWith("0000"), { error: "invalid_date" });

/** The zone every account starts with, and the one a stored zone the runtime no longer knows falls back to. */
export const DEFAULT_TIME_ZONE = "Europe/Helsinki";

/**
 * The canonical name of IANA time zone `name` as the runtime's `Intl` knows
 * it ("europe/helsinki" gives "Europe/Helsinki"), or null. An offset such as
 * "+02:00", which `Intl` also accepts, is not a zone and gives null.
 */
export function canonicalTimeZone(name: string): string | null {
  try {
    const zone = new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone;
    return /^[A-Za-z]/.test(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** Whether `name` is an IANA time zone the runtime's `Intl` knows. */
export const isKnownTimeZone = (name: string): boolean => canonicalTimeZone(name) !== null;

/** An IANA time zone name the runtime knows, answered in its canonical spelling. */
export const TimeZoneSchema = z
  .string({ error: "invalid_time_zone" })
  .max(64, { error: "invalid_time_zone" })
  .transform((name, ctx) => {
    const zone = canonicalTimeZone(name);
    if (zone === null) ctx.addIssue({ code: "custom", message: "invalid_time_zone" });
    return zone ?? name;
  });

export type IsoDate = z.infer<typeof IsoDateSchema>;
