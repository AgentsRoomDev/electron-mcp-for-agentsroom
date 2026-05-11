import type { CdpClient } from "../cdp/client.js";
import { ElectronMcpError } from "../utils/errors.js";

/**
 * Resolves a user-friendly selector to a concrete CSS selector evaluated in
 * the renderer. Supports three forms:
 *
 *   - "css=.foo > .bar"          → raw CSS selector
 *   - "testid=primary-button"    → matches [data-testid="primary-button"]
 *   - "text=Save"                → matches the first element whose textContent
 *                                  equals (trimmed) the given string
 *   - bare strings without prefix are treated as CSS by default
 *
 * The resolver is implemented as JS injected into the renderer rather than
 * via CDP DOM queries, because the CDP DOM domain is awkward for text-based
 * matching and is significantly slower for repeated queries.
 */

export type Selector = string;

export interface ResolveOptions {
  /** Throw if the selector matches nothing. Defaults to true. */
  required?: boolean;
  /** Wait up to `timeoutMs` for the element to appear. */
  timeoutMs?: number;
  /** Polling interval while waiting. */
  pollMs?: number;
}

/**
 * Returns a tagged JS expression that resolves to the matched element, or null.
 *
 * The expression sets a global `window.__electronMcpLastEl` so subsequent
 * actions (click, type, ...) can reuse the same element without re-resolving.
 */
export function buildResolverExpression(selector: Selector): string {
  const trimmed = selector.trim();
  let kind: "css" | "testid" | "text";
  let value: string;
  if (trimmed.startsWith("css=")) {
    kind = "css";
    value = trimmed.slice(4);
  } else if (trimmed.startsWith("testid=")) {
    kind = "testid";
    value = trimmed.slice(7);
  } else if (trimmed.startsWith("text=")) {
    kind = "text";
    value = trimmed.slice(5);
  } else {
    kind = "css";
    value = trimmed;
  }

  // We escape the value via JSON.stringify in the injected script.
  const valExpr = JSON.stringify(value);

  if (kind === "css") {
    return `(() => { const el = document.querySelector(${valExpr}); window.__electronMcpLastEl = el; return el; })()`;
  }
  if (kind === "testid") {
    return `(() => { const el = document.querySelector('[data-testid=' + JSON.stringify(${valExpr}) + ']'); window.__electronMcpLastEl = el; return el; })()`;
  }
  // text= : walk the DOM, find the first element whose trimmed textContent equals the value.
  return `(() => {
    const target = ${valExpr};
    const all = document.querySelectorAll('body *');
    let match = null;
    for (const el of all) {
      const txt = (el.textContent || '').trim();
      if (txt === target) { match = el; break; }
    }
    window.__electronMcpLastEl = match;
    return match;
  })()`;
}

/**
 * Returns true / false depending on whether the selector currently matches.
 */
export async function exists(cdp: CdpClient, selector: Selector): Promise<boolean> {
  const expr = `(() => { const r = ${buildResolverExpression(selector)}; return r != null; })()`;
  return cdp.evaluate<boolean>(expr);
}

/**
 * Resolves a selector and asserts it exists. Used by the tools that need an
 * element. Returns a small descriptor that callers can use for logging.
 */
export async function resolve(
  cdp: CdpClient,
  selector: Selector,
  opts: ResolveOptions = {},
): Promise<{ tagName: string; outerHTML: string }> {
  const required = opts.required ?? true;
  const timeoutMs = opts.timeoutMs ?? 0;
  const pollMs = opts.pollMs ?? 100;

  const tryOnce = async (): Promise<{ tagName: string; outerHTML: string } | null> => {
    const expr = `(() => {
      const el = ${buildResolverExpression(selector)};
      if (!el) return null;
      return { tagName: el.tagName, outerHTML: (el.outerHTML || '').slice(0, 4000) };
    })()`;
    return cdp.evaluate<{ tagName: string; outerHTML: string } | null>(expr);
  };

  const deadline = Date.now() + timeoutMs;
  let result = await tryOnce();
  while (!result && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    result = await tryOnce();
  }
  if (!result) {
    if (required) {
      throw new ElectronMcpError(
        "SELECTOR_NOT_FOUND",
        `Selector did not match any element: ${selector}`,
        { selector, timeoutMs },
      );
    }
    return { tagName: "", outerHTML: "" };
  }
  return result;
}
