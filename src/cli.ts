#!/usr/bin/env node
import { runServer } from "./server.js";
import { logger } from "./utils/logger.js";

interface ParsedArgs {
  host?: string;
  port?: number;
  targetId?: string;
  waitForTargetMs?: number;
  lazy?: boolean;
  name?: string;
  version?: string;
  help?: boolean;
  eventsDir?: string;
  eventLog?: boolean;
  eventSourceName?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "-h":
      case "--help":
        out.help = true;
        break;
      case "--host":
        out.host = next();
        break;
      case "--port":
        out.port = Number(next());
        break;
      case "--target":
      case "--target-id":
        out.targetId = next();
        break;
      case "--wait":
      case "--wait-for-target-ms":
        out.waitForTargetMs = Number(next());
        break;
      case "--lazy":
        out.lazy = true;
        break;
      case "--events-dir":
        out.eventsDir = next();
        break;
      case "--no-event-log":
        out.eventLog = false;
        break;
      case "--event-source":
        out.eventSourceName = next();
        break;
      case "--name":
        out.name = next();
        break;
      case "--version":
        out.version = next();
        break;
      default:
        if (a.startsWith("--")) {
          throw new Error(`Unknown flag ${a}`);
        }
    }
  }
  return out;
}

const HELP = `electron-mcp-server

Model Context Protocol server that drives any Electron app via Chrome DevTools Protocol.

USAGE
  electron-mcp-server --port 9223 [options]

OPTIONS
  --port <n>                CDP debug port the Electron app exposes via --remote-debugging-port=<n> (REQUIRED)
  --host <h>                Hostname (default 127.0.0.1)
  --target <id>             Specific CDP target id to attach to (default: first page-type target)
  --wait <ms>               How long to wait for a target to appear (default 10000)
  --lazy                    Defer the CDP connection until the first tool call
  --name <s>                Server name advertised over MCP (default electron-mcp-server)
  -h, --help                Show this help

ENVIRONMENT
  ELECTRON_MCP_LOG_LEVEL    debug | info | warn | error (default info)
  ELECTRON_MCP_LOG_PRETTY   set to 1 to enable pretty-printed logs (requires pino-pretty)

EXAMPLE
  # 1) Start your Electron app with the debug port:
  #    electron . --remote-debugging-port=9223
  # 2) Wire this server in your MCP client config:
  #    "electron": {
  #      "command": "npx",
  #      "args": ["electron-mcp-server", "--port", "9223"]
  #    }
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (!args.port || Number.isNaN(args.port)) {
    process.stderr.write(HELP);
    process.stderr.write("\nError: --port is required.\n");
    process.exit(1);
  }

  const handle = await runServer({
    host: args.host,
    port: args.port,
    targetId: args.targetId,
    waitForTargetMs: args.waitForTargetMs,
    lazy: args.lazy,
    name: args.name,
    version: args.version,
    eventsDir: args.eventsDir,
    eventLog: args.eventLog,
    eventSourceName: args.eventSourceName,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    try {
      await handle.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  process.on("uncaughtException", (err) => {
    logger.warn({ err }, "uncaughtException — keeping server alive");
  });
  process.on("unhandledRejection", (reason) => {
    logger.warn({ reason }, "unhandledRejection — keeping server alive");
  });
}

main().catch((err) => {
  logger.error({ err }, "fatal");
  process.exit(1);
});
