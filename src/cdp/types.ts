/**
 * Types shared across the CDP layer.
 */

export interface CdpTarget {
  /** CDP target id (stable for the lifetime of the page). */
  id: string;
  /** Page title at attach time. */
  title: string;
  /** URL of the page. */
  url: string;
  /** CDP target type: "page", "background_page", "service_worker", ... */
  type: string;
  /** WebSocket debugger URL. */
  webSocketDebuggerUrl?: string;
}

export interface AttachOptions {
  /** Host of the Electron debug port. Defaults to localhost. */
  host?: string;
  /** Port the Electron app exposes via --remote-debugging-port. */
  port: number;
  /** Optional preferred target id. If omitted, attaches to the first page. */
  targetId?: string;
  /** Wait for at least one target to become available. Defaults to 10s. */
  waitForTargetMs?: number;
}

export interface ConsoleMessage {
  level: "log" | "info" | "warn" | "error" | "debug" | "verbose";
  text: string;
  source: string;
  timestamp: number;
  /** Optional URL + line of the call site, when CDP provides it. */
  url?: string;
  lineNumber?: number;
}

export interface ScreenshotOptions {
  /** Image format; defaults to png. */
  format?: "png" | "jpeg";
  /** JPEG quality 0-100. Ignored for PNG. */
  quality?: number;
  /** CSS selector to capture instead of the full viewport. */
  selector?: string;
  /** Capture beyond the viewport. */
  fullPage?: boolean;
}
