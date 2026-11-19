import { TargetRangesSchema } from "@hovimestari/types";
import { recordedRemoveTargets, recordedSetTargets, replayTargets } from "../../../services/writes/recorded/targets.js";
import { dateIn, DayDate, writeInput } from "../../inputs.js";
import type { ToolContext } from "../../result.js";
import { targetsAsRead } from "../days.js";
import { defineWriteTool } from "./run.js";

// The targets write tools (design d.3), through the recorded targets
// services, which call the service PUT and DELETE /targets/:effectiveFrom
// call. The numbers are the person's: the tools pass them as given, and the
// service's own refusals are the only ones. A date may be `today`.

/** A retry answers the targets as they are now, as get_targets reads them. */
const replay = async (service: ToolContext["service"], recorded: Parameters<typeof replayTargets>[1]) => ({
  targets: targetsAsRead((await replayTargets(service, recorded)).targets),
});

export const setTargetsTool = defineWriteTool({
  name: "set_targets",
  description:
    "Set the person's targets from a date, today when left out: a calorie range in kcal and a protein range in grams, with the numbers the person gave. A change already on that date is replaced. Days before it keep the targets they had, or none. Answers the change and the targets after it. A retry sends exactly the same arguments, so a date left out stays left out.",
  inputSchema: writeInput({
    effectiveFrom: DayDate.optional().describe(
      "The first day the targets apply, YYYY-MM-DD, or today. Left out, today.",
    ),
    ranges: TargetRangesSchema.describe(
      "energyKcal and proteinG, each { lower, upper }, with lower at most upper, as the person gave them.",
    ),
  }),
  destructive: true,
  async run({ effectiveFrom, ranges }, { service, via }) {
    const { outcome, value } = await recordedSetTargets(service, via, {
      effectiveFrom: dateIn(effectiveFrom ?? "today", service.today),
      ranges,
    });
    return { outcome, data: { change: value.change, targets: targetsAsRead(value.targets) } };
  },
  replay,
});

export const removeTargetsTool = defineWriteTool({
  name: "remove_targets",
  description:
    "Remove the targets change that starts on a date, from get_targets. Its days then use the change before it, or have no targets. Setting the same numbers again from that date puts it back.",
  inputSchema: writeInput({
    effectiveFrom: DayDate.describe("The date the change starts, YYYY-MM-DD, or today."),
  }),
  destructive: true,
  async run({ effectiveFrom }, { service, via }) {
    const { outcome, value } = await recordedRemoveTargets(service, via, dateIn(effectiveFrom, service.today));
    return { outcome, data: { targets: targetsAsRead(value.targets) } };
  },
  replay,
});
