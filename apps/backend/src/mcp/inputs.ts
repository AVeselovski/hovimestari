import { DayParamSchema, DayRangeQuerySchema } from "@hovimestari/types";
import { z } from "zod";

// ---------------------------------------------------------------------------
// The pieces the tools' input schemas are built from (design d.3). Each is
// the schema the REST route parses, so a refusal names the field the model
// sent and the service gets what the route gets.
// ---------------------------------------------------------------------------

/** A day as `GET /days/:date` takes it: a date, or `today` for the person's today. */
export const DayDate = DayParamSchema.describe(
  "A date, YYYY-MM-DD, or today for the person's today in their time zone.",
);

/** The date a `DayDate` names: `today` reads as the person's today, as the day route reads it. */
export const dateIn = (date: string, today: string): string => (date === "today" ? today : date);

/** A run of days as `GET /days?from=&to=` takes it: from and to, at most 42 days with both ends counted. */
export const DayRange = DayRangeQuerySchema.describe(
  "From and to, YYYY-MM-DD, from on or before to, at most 42 days with both ends counted.",
);

/** The key that makes a retried write land once. Lifted from finanssiappisV2's tools/writes/inputs.ts. */
export const RequestKey = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "Use 8 to 64 letters, digits, - or _.")
  .describe(
    "A new random string for every change, for example k7Qx2mPa9. Send the same key again only to retry this exact call " +
      "after an error or no answer: the app then answers what the first call did and writes nothing new.",
  );
