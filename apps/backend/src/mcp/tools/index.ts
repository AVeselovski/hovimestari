import type { Tool } from "../result.js";
import { getContext } from "./context.js";

// The read tools every key lists. One file per area under tools/, each tool
// defined with defineTool and added here.

/* eslint-disable @typescript-eslint/no-explicit-any -- each tool keeps its own args type; the set is heterogeneous. */
type AnyTool = Tool<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const READ_TOOLS: readonly AnyTool[] = [getContext];
