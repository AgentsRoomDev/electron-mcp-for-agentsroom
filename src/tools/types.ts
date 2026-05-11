import type { z } from "zod";
import type { CdpClient } from "../cdp/client.js";
import type { Logger } from "../utils/logger.js";

export interface ToolContext {
  cdp: CdpClient;
  logger: Logger;
}

/**
 * A native tool. The MCP server adapts these into MCP tool definitions.
 *
 * `inputSchema` is a Zod schema. We convert it to JSON Schema in the server
 * layer when registering with the MCP SDK.
 */
export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  handler: (input: I, ctx: ToolContext) => Promise<O>;
}

export type AnyTool = Tool<any, any>;
