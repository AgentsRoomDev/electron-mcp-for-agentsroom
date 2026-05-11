import type { CdpTarget } from "./types.js";
import { ElectronMcpError } from "../utils/errors.js";

const DEFAULT_HOST = "127.0.0.1";

/**
 * Lists CDP targets exposed by an Electron app on `host:port/json`.
 *
 * Note: we hit the HTTP endpoint directly (no chrome-remote-interface) because
 * the lib's listing helper does the same thing under the hood and we want
 * tighter control over error reporting.
 */
export async function listTargets(host = DEFAULT_HOST, port: number): Promise<CdpTarget[]> {
  const url = `http://${host}:${port}/json`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new ElectronMcpError(
      "NOT_CONNECTED",
      `Cannot reach Electron debug endpoint at ${url}. Is the app running with --remote-debugging-port=${port}?`,
      { cause: err instanceof Error ? err.message : String(err) },
    );
  }
  if (!res.ok) {
    throw new ElectronMcpError(
      "CDP_ERROR",
      `Debug endpoint returned ${res.status} ${res.statusText}`,
      { url },
    );
  }
  const raw = (await res.json()) as Array<Partial<CdpTarget> & { id: string; title?: string; url?: string; type?: string; webSocketDebuggerUrl?: string }>;
  return raw.map((t) => ({
    id: t.id,
    title: t.title ?? "",
    url: t.url ?? "",
    type: t.type ?? "page",
    webSocketDebuggerUrl: t.webSocketDebuggerUrl,
  }));
}

/**
 * Selects the most relevant page target.
 *
 * Strategy:
 * 1. If a `preferredId` is given, return that exact target.
 * 2. Otherwise, prefer targets of type "page" (the renderer window).
 * 3. Among page targets, prefer the one whose URL is not "about:blank".
 * 4. Fall back to the first listed target.
 */
export function pickTarget(targets: CdpTarget[], preferredId?: string): CdpTarget {
  if (targets.length === 0) {
    throw new ElectronMcpError("NO_TARGET", "No CDP targets available on the debug endpoint.");
  }
  if (preferredId) {
    const match = targets.find((t) => t.id === preferredId);
    if (!match) {
      throw new ElectronMcpError(
        "NO_TARGET",
        `Target id "${preferredId}" not found.`,
        { available: targets.map((t) => t.id) },
      );
    }
    return match;
  }
  const pages = targets.filter((t) => t.type === "page");
  const pool = pages.length > 0 ? pages : targets;
  const meaningful = pool.find((t) => t.url && t.url !== "about:blank");
  return meaningful ?? pool[0]!;
}

/**
 * Polls `listTargets` until at least one target is available or the deadline expires.
 */
export async function waitForTarget(
  host: string,
  port: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<CdpTarget[]> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new ElectronMcpError("TIMEOUT", "Aborted while waiting for target");
    try {
      const targets = await listTargets(host, port);
      if (targets.length > 0) return targets;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (lastError instanceof ElectronMcpError) throw lastError;
  throw new ElectronMcpError(
    "TIMEOUT",
    `No CDP target appeared on ${host}:${port} within ${timeoutMs}ms`,
  );
}
