import { DayParamSchema, DayRangeQuerySchema } from "@hovimestari/types";

// ---------------------------------------------------------------------------
// The pieces the tools' input schemas are built from (design d.3). Each is
// the schema the REST route parses, so a refusal names the field the model
// sent and the service gets what the route gets. The tools that take them
// arrive with the read tools.
// ---------------------------------------------------------------------------

/** A day as `GET /days/:date` takes it: a date, or `today` for the person's today. */
export const DayDate = DayParamSchema.describe(
  "A date, YYYY-MM-DD, or today for the person's today in their time zone.",
);

/** A run of days as `GET /days?from=&to=` takes it: from and to, at most 42 days with both ends counted. */
export const DayRange = DayRangeQuerySchema.describe(
  "From and to, YYYY-MM-DD, from on or before to, at most 42 days with both ends counted.",
);
