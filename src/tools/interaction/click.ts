import { z } from "zod";
import type { Tool } from "../types.js";
import { resolve } from "../selector.js";
import { ElectronMcpError } from "../../utils/errors.js";

const InputSchema = z
  .object({
    selector: z.string().min(1),
    /** Mouse button to dispatch. */
    button: z.enum(["left", "middle", "right"]).default("left"),
    /** Number of clicks. Use 2 for double-click. */
    clickCount: z.number().int().min(1).max(3).default(1),
    /** Modifier keys held during the click. */
    modifiers: z
      .array(z.enum(["Alt", "Control", "Meta", "Shift"]))
      .default([]),
    /** Wait up to this many ms for the selector to appear. */
    timeoutMs: z.number().int().min(0).max(60_000).default(5000),
    /** Scroll the element into view before clicking. */
    scrollIntoView: z.boolean().default(true),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  clicked: { tagName: string; outerHTML: string };
  position: { x: number; y: number };
}

const MODIFIER_BITS: Record<string, number> = {
  Alt: 1,
  Control: 2,
  Meta: 4,
  Shift: 8,
};

export const clickTool: Tool<Input, Output> = {
  name: "click",
  description:
    "Clicks the element matching `selector`. Selector forms: `css=...`, `testid=...`, `text=...`, or a bare CSS string. Supports left/middle/right click, multi-click (double-click via `clickCount: 2`), and modifier keys (Alt/Control/Meta/Shift).",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const target = await resolve(cdp, input.selector, { timeoutMs: input.timeoutMs });

    if (input.scrollIntoView) {
      await cdp.evaluate(`(() => {
        const el = window.__electronMcpLastEl;
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      })()`);
    }

    const center = await cdp.evaluate<{ x: number; y: number } | null>(`(() => {
      const el = window.__electronMcpLastEl;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    })()`);

    if (!center) {
      throw new ElectronMcpError(
        "SELECTOR_NOT_FOUND",
        "Element resolved but has zero size; cannot click.",
        { selector: input.selector },
      );
    }

    const modifiers = input.modifiers.reduce((acc, m) => acc | (MODIFIER_BITS[m] ?? 0), 0);
    const c = cdp.raw();

    await c.Input.dispatchMouseEvent({
      type: "mouseMoved",
      x: center.x,
      y: center.y,
      modifiers,
    });
    await c.Input.dispatchMouseEvent({
      type: "mousePressed",
      x: center.x,
      y: center.y,
      button: input.button,
      clickCount: input.clickCount,
      modifiers,
    });
    await c.Input.dispatchMouseEvent({
      type: "mouseReleased",
      x: center.x,
      y: center.y,
      button: input.button,
      clickCount: input.clickCount,
      modifiers,
    });

    return {
      clicked: target,
      position: center,
    };
  },
};
