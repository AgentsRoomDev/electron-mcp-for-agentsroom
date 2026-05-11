import type { AnyTool } from "../types.js";
import { getStateTool } from "./get-state.js";
import { screenshotTool } from "./screenshot.js";
import { domQueryTool } from "./dom-query.js";
import { consoleLogsTool } from "./console-logs.js";
import { getRouteTool } from "./get-route.js";
import { listTargetsTool } from "./list-targets.js";
import { switchTargetTool } from "./switch-target.js";

export const observationTools: AnyTool[] = [
  getStateTool,
  screenshotTool,
  domQueryTool,
  consoleLogsTool,
  getRouteTool,
  listTargetsTool,
  switchTargetTool,
];
