/**
 * electron-mcp-server public API.
 *
 * Most users will run the bundled CLI via `npx electron-mcp-server`. This
 * entry point is for embedders who want to start the server in-process,
 * register additional tools, or use the CDP layer directly.
 */

export { runServer } from "./server.js";
export type { RunServerOptions } from "./server.js";

export { CdpClient } from "./cdp/client.js";
export type { CdpClientOptions } from "./cdp/client.js";
export type { CdpTarget, ConsoleMessage, ScreenshotOptions } from "./cdp/types.js";

export { builtinTools, observationTools, interactionTools, assertionTools } from "./tools/index.js";
export type { Tool, AnyTool, ToolContext } from "./tools/types.js";

export { ExtensionRegistry, defineExtension } from "./extensions/registry.js";
export type { Extension } from "./extensions/registry.js";

// Re-export zod so extension authors can build tool input schemas against the
// exact zod version this package uses, without adding their own dependency.
// The README's programmatic-usage example imports `z` from here.
export { z } from "zod";

export { ElectronMcpError, isElectronMcpError } from "./utils/errors.js";
export type { ElectronMcpErrorCode } from "./utils/errors.js";
