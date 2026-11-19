import { z } from "zod";
import { targetsOverview } from "../../services/reads/targets.js";
import { appRulesFor } from "../appRules.js";
import { defineTool } from "../result.js";

// get_context, the first call (design d.3): the key's access, the person's
// today and time zone, the targets as GET /targets reads them on today, and
// the app rules. It selects fields from the services' answers and computes
// nothing. `firstRunDue` stays out: it is a screen's routing fact.

export const getContext = defineTool({
  name: "get_context",
  description:
    "Start here. What this key may do and when it expires, the person's today and time zone, their targets in force today with every change of targets, and the rules for reading every figure.",
  inputSchema: z.strictObject({}),
  async run(_args, { service, auth, canWrite }) {
    const { inForce, changes } = await targetsOverview(service);
    return {
      access: { canWrite, expiresAt: auth.expiresAt },
      today: service.today,
      timeZone: service.timeZone,
      targets: { inForce, changes },
      rules: appRulesFor(canWrite),
    };
  },
});
