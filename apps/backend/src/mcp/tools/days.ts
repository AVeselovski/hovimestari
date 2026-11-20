import { IsoDateSchema, weekOf, type TargetsOverview } from "@hovimestari/types";
import { z } from "zod";
import { getDay, listDaySummaries } from "../../services/reads/days.js";
import { targetsOverview } from "../../services/reads/targets.js";
import { dateIn, DayDate, DayRange } from "../inputs.js";
import { defineTool, type ToolContext } from "../result.js";

// The targets and the days (design d.3), through the services GET /targets,
// GET /days/:date and GET /days call. Each answers the route's own fields.
// A date may be `today`, which reads as the person's today, as the day route
// reads it. No tool fills a day without targets: the services answer null.

const dateOf = (date: string, { service }: ToolContext): string => dateIn(date, service.today);

/** The targets as an assistant reads them: the overview without `firstRunDue`, a screen's routing fact. */
export const targetsAsRead = ({ date, today, inForce, changes }: TargetsOverview) => ({
  date,
  today,
  inForce,
  changes,
});

export const getTargetsTool = defineTool({
  name: "get_targets",
  description:
    "The person's targets in force on a date (today when left out), with every change of targets. inForce is null on a date before the first change, and changes is empty for a person with no targets.",
  inputSchema: z.strictObject({ date: DayDate.optional() }),
  async run({ date }, ctx) {
    return targetsAsRead(await targetsOverview(ctx.service, date === undefined ? undefined : dateOf(date, ctx)));
  },
});

export const getDayTool = defineTool({
  name: "get_day",
  description:
    "One day as the Day tab shows it: its targets, its two readings (eaten, and withPlan with the planned entries too), each with a position for energy and protein, its counts, and every entry with its figures. A past day's reading with no entries has no position.",
  inputSchema: z.strictObject({ date: DayDate }),
  run: ({ date }, ctx) => getDay(ctx.service, dateOf(date, ctx)),
});

/**
 * `from` and `to` together, as `GET /days` takes them, or `weekOf` alone. The
 * bound of a range is the route's own schema: at most 42 days, both ends
 * counted, so `to` is at most 41 days after `from`. The refinement names no
 * field the model did not send, and says nothing of the range while a date
 * is not a date: that date's own refusal is the one sentence it reads.
 */
const RANGE_REFUSED = "from must be on or before to, and a range holds at most 42 days, both ends counted.";

const DaysInput = z
  .strictObject({
    from: IsoDateSchema.optional().describe("The first day, YYYY-MM-DD. Give to with it, and no weekOf."),
    to: IsoDateSchema.optional().describe(
      "The last day, YYYY-MM-DD, on or after from. A range holds at most 42 days, both ends counted.",
    ),
    weekOf: DayDate.optional().describe(
      "Any date of a week, YYYY-MM-DD, or today: reads that week, Monday to Sunday. Give it alone.",
    ),
  })
  .superRefine((input, issues) => {
    const { from, to, weekOf: week } = input;
    if (week !== undefined) {
      if (from !== undefined || to !== undefined) {
        issues.addIssue({ code: "custom", message: "Give weekOf alone, or from and to without weekOf." });
      }
      return;
    }
    if (from === undefined || to === undefined) {
      issues.addIssue({ code: "custom", message: "Give from and to together, or weekOf alone." });
      return;
    }
    const isDate = (date: unknown) => IsoDateSchema.safeParse(date).success;
    if (isDate(from) && isDate(to) && !DayRange.safeParse({ from, to }).success) {
      issues.addIssue({ code: "custom", message: RANGE_REFUSED });
    }
  });

/**
 * The days `input` names: the week of `weekOf`, or `from` to `to`. The
 * refinement has already refused an input with neither, so the last case
 * names the one it can still be.
 */
function rangeOf(input: z.output<typeof DaysInput>, ctx: ToolContext): { from: string; to: string } {
  if (input.weekOf !== undefined) return weekOf(dateOf(input.weekOf, ctx));
  if (input.from !== undefined && input.to !== undefined) return { from: input.from, to: input.to };
  throw new Error("get_days reached its run without a range or a week.");
}

export const getDaysTool = defineTool({
  name: "get_days",
  description:
    "Several days without their entries: each day's targets, its two readings with their positions, and its counts. From from to to, at most 42 days with both ends counted, or the Monday-to-Sunday week holding weekOf. A past day's reading with no entries has no position.",
  inputSchema: DaysInput,
  async run(input, ctx) {
    return { days: await listDaySummaries(ctx.service, rangeOf(input, ctx)) };
  },
});
