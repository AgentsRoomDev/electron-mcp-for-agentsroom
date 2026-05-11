import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CdpClient, type CdpClientOptions } from "./cdp/client.js";
import { builtinTools } from "./tools/index.js";
import type { AnyTool, ToolContext } from "./tools/types.js";
import type { Extension } from "./extensions/registry.js";
import { ExtensionRegistry } from "./extensions/registry.js";
import { isElectronMcpError } from "./utils/errors.js";
import { child, logger } from "./utils/logger.js";
import { initEventLog, appendEvent, newEventId, saveScreenshot, getSourceName, readCurrentAgent } from "./utils/event-log.js";

const log = child({ module: "server" });

export interface RunServerOptions extends CdpClientOptions {
  /** MCP server name advertised over the protocol. */
  name?: string;
  /** MCP server version advertised over the protocol. */
  version?: string;
  /** Additional in-process extensions to register before the server starts. */
  extensions?: Extension[];
  /** Lazy-attach: wait until the first tool call to connect to CDP. */
  lazy?: boolean;
  /** Where to write tool-call events. Defaults to `~/.agentsroom/mcp-events`. */
  eventsDir?: string;
  /** Set to false to disable the event log entirely. Defaults to true. */
  eventLog?: boolean;
  /**
   * Identifier this server uses in event `source` fields and JSONL filename.
   * Defaults to `electron-mcp`. A fork driving a different runtime (e.g.
   * `react-native-mcp`) sets this so the desktop panel can show it in a
   * dedicated tab.
   */
  eventSourceName?: string;
}

const DEFAULT_NAME = "electron-mcp-server";
const DEFAULT_VERSION = "0.1.0";

/**
 * Builds and starts the MCP server. Returns a handle that can be used to
 * stop the server cleanly.
 */
export async function runServer(opts: RunServerOptions): Promise<{ stop: () => Promise<void> }> {
  const cdp = new CdpClient(opts);
  const registry = new ExtensionRegistry();
  for (const ext of opts.extensions ?? []) registry.register(ext);

  if (opts.eventLog !== false) {
    initEventLog(opts.eventsDir, opts.eventSourceName);
  }

  const server = new McpServer({
    name: opts.name ?? DEFAULT_NAME,
    version: opts.version ?? DEFAULT_VERSION,
  });

  const ctx: ToolContext = { cdp, logger };

  // Ensure CDP is connected before the first tool call.
  let connectPromise: Promise<void> | null = null;
  const ensureConnected = async (): Promise<void> => {
    if (cdp.isConnected()) return;
    if (!connectPromise) {
      connectPromise = cdp.connect().catch((err) => {
        connectPromise = null;
        throw err;
      });
    }
    await connectPromise;
  };

  if (!opts.lazy) {
    await ensureConnected();
  }

  // Register built-in tools.
  for (const tool of builtinTools) registerTool(server, tool, ctx, ensureConnected);

  // Register extension tools.
  for (const tool of registry.allTools()) registerTool(server, tool, ctx, ensureConnected);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info(
    { name: opts.name ?? DEFAULT_NAME, version: opts.version ?? DEFAULT_VERSION },
    "electron-mcp-server ready",
  );

  return {
    stop: async () => {
      log.info("stopping server");
      await server.close();
      await cdp.close();
    },
  };
}

function registerTool(
  server: McpServer,
  tool: AnyTool,
  ctx: ToolContext,
  ensureConnected: () => Promise<void>,
): void {
  // The MCP SDK accepts a Zod object schema's shape and infers the JSON Schema.
  // We pass `tool.inputSchema` if it is a ZodObject; otherwise wrap in an object.
  const schemaShape =
    tool.inputSchema instanceof z.ZodObject
      ? (tool.inputSchema as z.ZodObject<any>).shape
      : { value: tool.inputSchema };

  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: schemaShape,
    },
    async (input: unknown) => {
      const eventId = newEventId();
      const start = Date.now();
      let validated: unknown = input;
      try {
        await ensureConnected();
        validated = tool.inputSchema.parse(
          tool.inputSchema instanceof z.ZodObject ? input : (input as { value: unknown }).value,
        );
        const result = await tool.handler(validated, ctx);
        logToolEvent({ eventId, start, tool: tool.name, input: validated, result });
        return formatResult(tool.name, result);
      } catch (err) {
        logToolError({ eventId, start, tool: tool.name, input: validated, err });
        return formatError(tool.name, err);
      }
    },
  );
}

function logToolEvent(args: { eventId: string; start: number; tool: string; input: unknown; result: unknown }): void {
  let screenshotPath: string | undefined;
  let output: unknown = args.result;
  if (
    args.tool === "screenshot" &&
    typeof args.result === "object" &&
    args.result !== null &&
    "data" in args.result &&
    "format" in args.result
  ) {
    const r = args.result as { data: string; format: "png" | "jpeg"; width: number; height: number };
    screenshotPath = saveScreenshot(args.eventId, r.data, r.format);
    output = { width: r.width, height: r.height, format: r.format };
  }
  const focus = readCurrentAgent();
  appendEvent({
    id: args.eventId,
    ts: args.start,
    source: getSourceName(),
    agentId: focus.agentId,
    parentAgentId: focus.parentAgentId,
    tool: args.tool,
    input: args.input,
    ok: true,
    durationMs: Date.now() - args.start,
    output,
    ...(screenshotPath ? { screenshotPath } : {}),
  });
}

function logToolError(args: { eventId: string; start: number; tool: string; input: unknown; err: unknown }): void {
  const e = isElectronMcpError(args.err) ? args.err.toJSON() : { code: "INTERNAL", message: args.err instanceof Error ? args.err.message : String(args.err) };
  const focus = readCurrentAgent();
  appendEvent({
    id: args.eventId,
    ts: args.start,
    source: getSourceName(),
    agentId: focus.agentId,
    parentAgentId: focus.parentAgentId,
    tool: args.tool,
    input: args.input,
    ok: false,
    durationMs: Date.now() - args.start,
    error: { code: e.code, message: e.message },
  });
}

function formatResult(toolName: string, result: unknown): {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  structuredContent?: Record<string, unknown>;
} {
  // Special-case the screenshot tool to return an image content block.
  if (
    toolName === "screenshot" &&
    typeof result === "object" &&
    result !== null &&
    "data" in result &&
    "format" in result
  ) {
    const r = result as { data: string; format: "png" | "jpeg"; width: number; height: number };
    return {
      content: [
        {
          type: "image",
          data: r.data,
          mimeType: r.format === "png" ? "image/png" : "image/jpeg",
        },
        {
          type: "text",
          text: JSON.stringify({ width: r.width, height: r.height, format: r.format }),
        },
      ],
      structuredContent: { width: r.width, height: r.height, format: r.format },
    };
  }
  const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: typeof result === "object" && result !== null
      ? (result as Record<string, unknown>)
      : { value: result },
  };
}

function formatError(toolName: string, err: unknown): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  const payload = isElectronMcpError(err)
    ? err.toJSON()
    : { name: "Error", code: "INTERNAL", message: err instanceof Error ? err.message : String(err) };
  log.warn({ tool: toolName, err: payload }, "tool failed");
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}
