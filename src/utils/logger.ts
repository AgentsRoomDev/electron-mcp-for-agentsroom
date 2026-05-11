import pino from "pino";

/**
 * Structured logger for the electron-mcp-server.
 *
 * IMPORTANT: this server runs as an MCP server over stdio. Anything written to
 * stdout MUST be a valid MCP frame, otherwise the client breaks. So we route
 * all logs to stderr regardless of level.
 */
export const logger = pino({
  level: process.env.ELECTRON_MCP_LOG_LEVEL ?? "info",
  transport: process.env.ELECTRON_MCP_LOG_PRETTY
    ? {
        target: "pino-pretty",
        options: {
          destination: 2, // stderr
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      }
    : undefined,
}, pino.destination(2)); // raw mode also goes to stderr

export type Logger = typeof logger;

export function child(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
