import { mkdirSync, appendFileSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { child } from "./logger.js";

const log = child({ module: "event-log" });

const DEFAULT_DIR = join(homedir(), ".agentsroom", "mcp-events");
const SCREENSHOTS_SUBDIR = "screenshots";
const CURRENT_AGENT_FILE = "current-agent.json";
const DEFAULT_SOURCE = "electron-mcp";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const TRUNCATED_KEEP_BYTES = 1 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 4000;

export interface McpToolEvent {
  id: string;
  ts: number;
  /**
   * Identifies the MCP server that produced this event (e.g. `electron-mcp`,
   * `react-native-mcp`, …). The desktop panel filters on this so different
   * surfaces can share the same `~/.agentsroom/mcp-events/` directory.
   */
  source: string;
  /**
   * AgentsRoom agent the desktop UI was focused on when this tool call
   * landed. Best-effort: read from `current-agent.json` at the moment of
   * the call. `null` when no agent is focused, the file is missing, or
   * the MCP server runs outside an AgentsRoom desktop session.
   */
  agentId: string | null;
  /**
   * For events produced by an ephemeral sub-agent (e.g. a QA Bot spawned via
   * AgentsRoom's test-runner), this is the master agent id that triggered
   * the run. Lets the desktop trace panel fold the sub-agent's events under
   * the caller even after the sub-agent has been killed.
   */
  parentAgentId?: string | null;
  tool: string;
  input: unknown;
  ok: boolean;
  durationMs: number;
  output?: unknown;
  screenshotPath?: string;
  error?: { code?: string; message: string };
}

export interface EventLogConfig {
  dir: string;
  eventsFile: string;
  screenshotsDir: string;
  sourceName: string;
}

let config: EventLogConfig | null = null;

export function initEventLog(customDir?: string, sourceName?: string): EventLogConfig {
  const dir = customDir ?? DEFAULT_DIR;
  const source = sourceName ?? DEFAULT_SOURCE;
  const screenshotsDir = join(dir, SCREENSHOTS_SUBDIR);
  const eventsFile = join(dir, `${source}.jsonl`);
  try {
    mkdirSync(screenshotsDir, { recursive: true });
  } catch (err) {
    log.warn({ err, dir }, "could not create events dir; event log disabled");
    config = null;
    return { dir, eventsFile, screenshotsDir, sourceName: source };
  }
  config = { dir, eventsFile, screenshotsDir, sourceName: source };
  log.info({ dir, source }, "event log initialized");
  return config;
}

export function getSourceName(): string {
  return config?.sourceName ?? DEFAULT_SOURCE;
}

/**
 * Resolves the currently-focused AgentsRoom agent id by reading the small
 * `current-agent.json` file the desktop writes whenever the focus changes.
 * Best-effort: any failure → `null` (event still gets logged, just without
 * an `agentId`, so it shows up in the unfiltered tab but not per-agent).
 */
export function readCurrentAgentId(): string | null {
  return readCurrentAgent().agentId;
}

/**
 * Same as `readCurrentAgentId` but also returns the `parentAgentId` field
 * when the focused agent is itself an ephemeral sub-agent (e.g. a QA Bot
 * spawned by the AgentsRoom test-runner). Callers that stamp events should
 * prefer this so the trace panel can fold sub-agent events under the master.
 */
export function readCurrentAgent(): { agentId: string | null; parentAgentId: string | null } {
  if (!config) return { agentId: null, parentAgentId: null };
  const path = join(config.dir, CURRENT_AGENT_FILE);
  if (!existsSync(path)) return { agentId: null, parentAgentId: null };
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { agentId?: unknown; parentAgentId?: unknown };
    const agentId = typeof parsed.agentId === "string" && parsed.agentId.length > 0 ? parsed.agentId : null;
    const parentAgentId = typeof parsed.parentAgentId === "string" && parsed.parentAgentId.length > 0
      ? parsed.parentAgentId
      : null;
    return { agentId, parentAgentId };
  } catch {
    return { agentId: null, parentAgentId: null };
  }
}

export function getConfig(): EventLogConfig | null {
  return config;
}

export function newEventId(): string {
  return randomUUID();
}

/** Append a single event as one JSON line. Truncates the file when it grows past MAX_FILE_BYTES. */
export function appendEvent(event: McpToolEvent): void {
  if (!config) return;
  const sanitized = sanitizeEvent(event);
  const line = JSON.stringify(sanitized) + "\n";
  try {
    appendFileSync(config.eventsFile, line, "utf8");
    rotateIfNeeded();
  } catch (err) {
    log.warn({ err, file: config.eventsFile }, "appendEvent failed");
  }
}

/** Save a base64 PNG to the screenshots dir and return the absolute path. */
export function saveScreenshot(eventId: string, base64Data: string, format: "png" | "jpeg" = "png"): string | undefined {
  if (!config) return undefined;
  const ext = format === "jpeg" ? "jpg" : "png";
  const path = join(config.screenshotsDir, `${eventId}.${ext}`);
  try {
    writeFileSync(path, Buffer.from(base64Data, "base64"));
    return path;
  } catch (err) {
    log.warn({ err, path }, "saveScreenshot failed");
    return undefined;
  }
}

function sanitizeEvent(event: McpToolEvent): McpToolEvent {
  const out: McpToolEvent = { ...event };
  if (out.output !== undefined && out.tool !== "screenshot") {
    const asText = typeof out.output === "string" ? out.output : JSON.stringify(out.output);
    if (asText.length > MAX_OUTPUT_CHARS) {
      out.output = `${asText.slice(0, MAX_OUTPUT_CHARS)}…[truncated ${asText.length - MAX_OUTPUT_CHARS} chars]`;
    }
  }
  if (out.tool === "screenshot" && out.output !== null && typeof out.output === "object" && out.output) {
    const o = out.output as Record<string, unknown>;
    out.output = { width: o.width, height: o.height, format: o.format };
  }
  return out;
}

function rotateIfNeeded(): void {
  if (!config) return;
  try {
    const s = statSync(config.eventsFile);
    if (s.size <= MAX_FILE_BYTES) return;
    const buf = readFileSync(config.eventsFile);
    const tail = buf.subarray(buf.length - TRUNCATED_KEEP_BYTES);
    const firstNewline = tail.indexOf(10);
    const kept = firstNewline >= 0 ? tail.subarray(firstNewline + 1) : tail;
    writeFileSync(config.eventsFile, kept);
    log.info({ from: s.size, to: kept.length }, "events file rotated");
  } catch (err) {
    log.warn({ err }, "rotateIfNeeded failed");
  }
}

/** Read all events currently in the log (newest last). Best-effort: malformed lines are skipped. */
export function readEvents(): McpToolEvent[] {
  if (!config || !existsSync(config.eventsFile)) return [];
  try {
    const raw = readFileSync(config.eventsFile, "utf8");
    const out: McpToolEvent[] = [];
    for (const line of raw.split("\n")) {
      if (!line) continue;
      try { out.push(JSON.parse(line)); } catch { /* skip */ }
    }
    return out;
  } catch (err) {
    log.warn({ err }, "readEvents failed");
    return [];
  }
}
