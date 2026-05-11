import { z } from "zod";
import type { Tool } from "../types.js";

const InputSchema = z
  .object({
    selector: z.string().min(1),
    /** Maximum number of matched elements to return. */
    limit: z.number().int().min(1).max(50).default(5),
    /** Truncate outerHTML at this length per element. */
    maxOuterHtmlLength: z.number().int().min(64).max(20000).default(2000),
    /** Include computed visibility (offsetWidth>0 && offsetHeight>0). */
    includeVisibility: z.boolean().default(true),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface MatchedElement {
  tagName: string;
  id: string | null;
  classList: string[];
  attributes: Record<string, string>;
  textContent: string;
  outerHTML: string;
  visible?: boolean;
  rect?: { x: number; y: number; width: number; height: number };
}

interface Output {
  count: number;
  matches: MatchedElement[];
}

export const domQueryTool: Tool<Input, Output> = {
  name: "dom_query",
  description:
    "Queries the renderer DOM with a CSS selector. Returns up to `limit` matches with tag, attributes, text content, outerHTML (truncated), bounding rect, and visibility. Supports the same selector forms as click/type (css= / testid= / text=).",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const expr = `(() => {
      const sel = ${JSON.stringify(input.selector)};
      const limit = ${input.limit};
      const maxLen = ${input.maxOuterHtmlLength};
      const includeVis = ${input.includeVisibility};

      // Same prefix logic as the resolver, kept inline so the renderer doesn't
      // depend on anything we haven't injected.
      let nodes = [];
      if (sel.startsWith("testid=")) {
        const v = sel.slice(7);
        const escaped = '"' + v.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"') + '"';
        nodes = Array.from(document.querySelectorAll('[data-testid=' + escaped + ']'));
      } else if (sel.startsWith("text=")) {
        const target = sel.slice(5);
        for (const el of document.querySelectorAll('body *')) {
          if ((el.textContent || '').trim() === target) {
            nodes.push(el);
            if (nodes.length >= limit) break;
          }
        }
      } else {
        const css = sel.startsWith("css=") ? sel.slice(4) : sel;
        nodes = Array.from(document.querySelectorAll(css));
      }

      const out = [];
      for (const el of nodes.slice(0, limit)) {
        const attrs = {};
        for (const a of el.attributes || []) attrs[a.name] = a.value;
        const item = {
          tagName: el.tagName,
          id: el.id || null,
          classList: Array.from(el.classList || []),
          attributes: attrs,
          textContent: (el.textContent || '').trim().slice(0, 500),
          outerHTML: (el.outerHTML || '').slice(0, maxLen),
        };
        if (includeVis) {
          const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          item.rect = r ? { x: r.x, y: r.y, width: r.width, height: r.height } : undefined;
          item.visible = !!(el.offsetWidth || el.offsetHeight || (r && r.width && r.height));
        }
        out.push(item);
      }
      return { count: nodes.length, matches: out };
    })()`;
    return cdp.evaluate<Output>(expr);
  },
};
