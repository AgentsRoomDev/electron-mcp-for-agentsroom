import { z } from "zod";
import type { Tool } from "../types.js";

const InputSchema = z
  .object({
    /** Maximum number of messages to return (most recent first). */
    limit: z.number().int().min(1).max(500).default(100),
    /** Filter by minimum severity. */
    minLevel: z.enum(["debug", "verbose", "log", "info", "warn", "error"]).default("debug"),
    /** Substring match on message text (case-insensitive). */
    contains: z.string().optional(),
    /** If true, clear the buffer after returning. */
    clear: z.boolean().default(false),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  total: number;
  messages: Array<{
    level: string;
    text: string;
    source: string;
    timestamp: number;
    url?: string;
    lineNumber?: number;
  }>;
}

const LEVEL_RANK: Record<string, number> = {
  debug: 0,
  verbose: 1,
  log: 2,
  info: 3,
  warn: 4,
  error: 5,
};

export const consoleLogsTool: Tool<Input, Output> = {
  name: "console_logs",
  description:
    "Returns the recent renderer console messages buffered since the MCP server attached. Filter by severity (`minLevel`) or substring (`contains`). Use `clear=true` to drain the buffer after reading.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const buf = cdp.getConsoleBuffer();
    const minRank = LEVEL_RANK[input.minLevel] ?? 0;
    const needle = input.contains?.toLowerCase();
    const filtered = buf.filter((m) => {
      if ((LEVEL_RANK[m.level] ?? 0) < minRank) return false;
      if (needle && !m.text.toLowerCase().includes(needle)) return false;
      return true;
    });
    const slice = filtered.slice(-input.limit).reverse();
    if (input.clear) cdp.clearConsoleBuffer();
    return {
      total: filtered.length,
      messages: slice.map((m) => ({
        level: m.level,
        text: m.text,
        source: m.source,
        timestamp: m.timestamp,
        url: m.url,
        lineNumber: m.lineNumber,
      })),
    };
  },
};
