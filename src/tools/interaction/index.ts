import type { AnyTool } from "../types.js";
import { clickTool } from "./click.js";
import { typeTool } from "./type.js";
import { pressKeyTool } from "./press-key.js";
import { navigateTool } from "./navigate.js";
import { reloadTool } from "./reload.js";
import { evaluateTool } from "./evaluate.js";
import { waitForSelectorTool } from "./wait-for-selector.js";
import { scrollTool } from "./scroll.js";

export const interactionTools: AnyTool[] = [
  clickTool,
  typeTool,
  pressKeyTool,
  navigateTool,
  reloadTool,
  evaluateTool,
  waitForSelectorTool,
  scrollTool,
];
