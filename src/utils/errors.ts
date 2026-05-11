/**
 * Typed error classes for the electron-mcp-server.
 *
 * These errors carry a stable `code` field that LLM clients can branch on
 * without parsing free-form messages.
 */

export type ElectronMcpErrorCode =
  | "NOT_CONNECTED"
  | "NO_TARGET"
  | "TARGET_LOST"
  | "SELECTOR_NOT_FOUND"
  | "TIMEOUT"
  | "INVALID_INPUT"
  | "ASSERTION_FAILED"
  | "EXTENSION_FAILED"
  | "CDP_ERROR"
  | "INTERNAL";

export class ElectronMcpError extends Error {
  public readonly code: ElectronMcpErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ElectronMcpErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ElectronMcpError";
    this.code = code;
    this.details = details;
  }

  toJSON(): { name: string; code: string; message: string; details?: Record<string, unknown> } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function isElectronMcpError(err: unknown): err is ElectronMcpError {
  return err instanceof ElectronMcpError;
}

export function wrapError(err: unknown, code: ElectronMcpErrorCode = "INTERNAL"): ElectronMcpError {
  if (isElectronMcpError(err)) return err;
  if (err instanceof Error) {
    const wrapped = new ElectronMcpError(code, err.message, { cause: err.name });
    wrapped.stack = err.stack;
    return wrapped;
  }
  return new ElectronMcpError(code, String(err));
}
