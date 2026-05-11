import type { AnyTool } from "../types.js";
import { assertTextTool } from "./assert-text.js";
import { assertVisibleTool } from "./assert-visible.js";
import { assertCountTool } from "./assert-count.js";
import { assertRouteTool } from "./assert-route.js";

export const assertionTools: AnyTool[] = [
  assertTextTool,
  assertVisibleTool,
  assertCountTool,
  assertRouteTool,
];
