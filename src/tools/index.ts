import type { AnyTool } from "./types.js";
import { observationTools } from "./observation/index.js";
import { interactionTools } from "./interaction/index.js";
import { assertionTools } from "./assertions/index.js";

export type { Tool, AnyTool, ToolContext } from "./types.js";

/** All built-in tools provided by the server. */
export const builtinTools: AnyTool[] = [
  ...observationTools,
  ...interactionTools,
  ...assertionTools,
];

export { observationTools, interactionTools, assertionTools };
