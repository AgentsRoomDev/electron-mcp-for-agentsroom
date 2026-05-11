import CDP from "chrome-remote-interface";
import { EventEmitter } from "node:events";
import { ElectronMcpError, wrapError } from "../utils/errors.js";
import { child } from "../utils/logger.js";
import type { CdpTarget, ConsoleMessage } from "./types.js";
import { listTargets, pickTarget, waitForTarget } from "./targets.js";

const log = child({ module: "cdp" });

/** Maximum number of console messages we buffer per target. */
const MAX_CONSOLE_BUFFER = 500;

export interface CdpClientOptions {
  host?: string;
  port: number;
  targetId?: string;
  waitForTargetMs?: number;
}

/**
 * Thin wrapper over `chrome-remote-interface` that owns a single attached
 * target. The wrapper:
 *   - re-establishes the connection if the target is destroyed
 *   - buffers console output the renderer emits while we're attached
 *   - provides typed convenience methods that the tools layer consumes
 *
 * It is intentionally low-level: tools compose calls on top of it.
 */
export class CdpClient extends EventEmitter {
  private opts: Required<Pick<CdpClientOptions, "host" | "port">> & {
    targetId?: string;
    waitForTargetMs: number;
  };
  private cdp: CDP.Client | null = null;
  private currentTarget: CdpTarget | null = null;
  private consoleBuffer: ConsoleMessage[] = [];
  private connected = false;
  private closing = false;

  constructor(opts: CdpClientOptions) {
    super();
    this.opts = {
      host: opts.host ?? "127.0.0.1",
      port: opts.port,
      targetId: opts.targetId,
      waitForTargetMs: opts.waitForTargetMs ?? 10_000,
    };
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.connected) return;
    log.info({ host: this.opts.host, port: this.opts.port }, "attaching CDP");
    const targets = await waitForTarget(this.opts.host, this.opts.port, this.opts.waitForTargetMs);
    const target = pickTarget(targets, this.opts.targetId);
    this.currentTarget = target;
    log.info({ targetId: target.id, url: target.url }, "selected CDP target");
    try {
      this.cdp = await CDP({ host: this.opts.host, port: this.opts.port, target: target.id });
    } catch (err) {
      throw wrapError(err, "CDP_ERROR");
    }
    // Swallow socket-level errors so they don't crash the MCP process when the
    // renderer reloads/teardown happens mid-call.
    this.cdp.on("error", (err) => {
      log.warn({ err: err instanceof Error ? err.message : String(err) }, "CDP socket error");
    });
    await this.enableDomains();
    this.wireConsole();
    this.wireDisconnect();
    this.connected = true;
    this.emit("connected", target);
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.cdp) {
      try {
        await this.cdp.close();
      } catch (err) {
        log.warn({ err }, "error closing CDP client");
      }
    }
    this.cdp = null;
    this.connected = false;
    this.emit("closed");
  }

  isConnected(): boolean {
    return this.connected && this.cdp !== null;
  }

  getTarget(): CdpTarget {
    if (!this.currentTarget) {
      throw new ElectronMcpError("NOT_CONNECTED", "CDP client is not attached to any target");
    }
    return this.currentTarget;
  }

  /** Refreshes the target list and switches to a new target if `targetId` differs. */
  async switchTarget(targetId: string): Promise<void> {
    if (this.currentTarget?.id === targetId) return;
    log.info({ from: this.currentTarget?.id, to: targetId }, "switching CDP target");
    await this.close();
    this.opts.targetId = targetId;
    this.closing = false;
    this.consoleBuffer = [];
    await this.connect();
  }

  async listTargets(): Promise<CdpTarget[]> {
    return listTargets(this.opts.host, this.opts.port);
  }

  // ─── Domain methods ─────────────────────────────────────────────────────

  private async enableDomains(): Promise<void> {
    const c = this.requireCdp();
    await Promise.all([
      c.Page.enable(),
      c.Runtime.enable(),
      c.DOM.enable(),
      c.Log.enable(),
    ]);
  }

  private wireConsole(): void {
    const c = this.requireCdp();
    c.Runtime.consoleAPICalled((event) => {
      const text = event.args
        .map((a) => {
          if (a.type === "string") return String(a.value ?? "");
          if (a.value !== undefined) return JSON.stringify(a.value);
          if (a.description) return a.description;
          return a.type;
        })
        .join(" ");
      const msg: ConsoleMessage = {
        level: normalizeLevel(event.type),
        text,
        source: "console-api",
        timestamp: event.timestamp ?? Date.now(),
        url: event.stackTrace?.callFrames?.[0]?.url,
        lineNumber: event.stackTrace?.callFrames?.[0]?.lineNumber,
      };
      this.pushConsole(msg);
    });
    c.Log.entryAdded((event) => {
      const e = event.entry;
      const msg: ConsoleMessage = {
        level: normalizeLevel(e.level),
        text: e.text,
        source: e.source ?? "log",
        timestamp: e.timestamp ?? Date.now(),
        url: e.url,
        lineNumber: e.lineNumber,
      };
      this.pushConsole(msg);
    });
  }

  private pushConsole(msg: ConsoleMessage): void {
    this.consoleBuffer.push(msg);
    if (this.consoleBuffer.length > MAX_CONSOLE_BUFFER) {
      this.consoleBuffer.splice(0, this.consoleBuffer.length - MAX_CONSOLE_BUFFER);
    }
    this.emit("console", msg);
  }

  private wireDisconnect(): void {
    const c = this.requireCdp();
    c.on("disconnect", () => {
      if (this.closing) return;
      log.warn({ targetId: this.currentTarget?.id }, "CDP target disconnected");
      this.connected = false;
      this.cdp = null;
      // Drop the preferred target id: when the renderer reloads, Electron may
      // recreate the target with a new id. The next connect() should pick a
      // fresh one via the default strategy instead of failing on the stale id.
      this.opts.targetId = undefined;
      this.consoleBuffer = [];
      this.emit("target-lost");
    });
  }

  // ─── Public API used by tools ───────────────────────────────────────────

  getConsoleBuffer(): readonly ConsoleMessage[] {
    return this.consoleBuffer;
  }

  clearConsoleBuffer(): void {
    this.consoleBuffer = [];
  }

  /**
   * Evaluates an expression in the renderer.
   *
   * Returns the unwrapped value when serializable, or throws ElectronMcpError
   * with the runtime exception otherwise.
   */
  async evaluate<T = unknown>(expression: string, awaitPromise = true): Promise<T> {
    const c = this.requireCdp();
    try {
      const { result, exceptionDetails } = await c.Runtime.evaluate({
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true,
      });
      if (exceptionDetails) {
        throw new ElectronMcpError(
          "CDP_ERROR",
          `Renderer threw: ${exceptionDetails.text} ${exceptionDetails.exception?.description ?? ""}`.trim(),
          { exception: exceptionDetails.exception?.description },
        );
      }
      return result.value as T;
    } catch (err) {
      throw wrapError(err, "CDP_ERROR");
    }
  }

  /** Direct access to the underlying CDP client. */
  raw(): CDP.Client {
    return this.requireCdp();
  }

  private requireCdp(): CDP.Client {
    if (!this.cdp) {
      throw new ElectronMcpError("NOT_CONNECTED", "CDP client is not connected. Call connect() first.");
    }
    return this.cdp;
  }
}

function normalizeLevel(t: string): ConsoleMessage["level"] {
  switch (t) {
    case "log":
    case "info":
    case "warn":
    case "warning":
      return t === "warning" ? "warn" : (t as ConsoleMessage["level"]);
    case "error":
    case "debug":
    case "verbose":
      return t;
    default:
      return "log";
  }
}
