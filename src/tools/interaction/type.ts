import { z } from "zod";
import type { Tool } from "../types.js";
import { resolve } from "../selector.js";

const InputSchema = z
  .object({
    selector: z.string().min(1),
    text: z.string(),
    /** Clear the input first by setting value to "" before typing. */
    clear: z.boolean().default(false),
    /** Delay between keystrokes in ms (0 = paste-style). */
    delayMs: z.number().int().min(0).max(500).default(0),
    /** Press Enter after typing. */
    pressEnter: z.boolean().default(false),
    timeoutMs: z.number().int().min(0).max(60_000).default(5000),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  typed: string;
  selector: string;
}

export const typeTool: Tool<Input, Output> = {
  name: "type",
  description:
    "Focuses the element matching `selector` and types `text` into it. For React-controlled inputs we use Input.insertText (paste-like) when `delayMs` is 0, and per-character keystrokes when `delayMs` > 0 to trigger onChange handlers progressively. Optionally clear the field first or press Enter after typing.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    await resolve(cdp, input.selector, { timeoutMs: input.timeoutMs });

    // Focus the element + optionally clear it. We dispatch a native input event
    // so React/Vue/Svelte controlled inputs see the change.
    if (input.clear) {
      await cdp.evaluate(`(() => {
        const el = window.__electronMcpLastEl;
        if (!el) return;
        el.focus();
        if ('value' in el) {
          const desc = Object.getOwnPropertyDescriptor(el.__proto__, 'value') ||
                       Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
          if (desc && desc.set) desc.set.call(el, '');
          else el.value = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (el.isContentEditable) {
          el.textContent = '';
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
    } else {
      await cdp.evaluate(`(() => {
        const el = window.__electronMcpLastEl;
        if (el && el.focus) el.focus();
      })()`);
    }

    const c = cdp.raw();

    if (input.delayMs === 0) {
      await c.Input.insertText({ text: input.text });
    } else {
      for (const ch of input.text) {
        await c.Input.dispatchKeyEvent({ type: "char", text: ch });
        if (input.delayMs > 0) await new Promise((r) => setTimeout(r, input.delayMs));
      }
    }

    if (input.pressEnter) {
      await c.Input.dispatchKeyEvent({
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        text: "\r",
        unmodifiedText: "\r",
      });
      await c.Input.dispatchKeyEvent({
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
    }

    return { typed: input.text, selector: input.selector };
  },
};
