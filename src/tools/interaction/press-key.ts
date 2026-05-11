import { z } from "zod";
import type { Tool } from "../types.js";

const InputSchema = z
  .object({
    /**
     * Key combination, e.g. "Enter", "Escape", "Tab", "ArrowDown",
     * "Meta+K", "Control+Shift+P", "Alt+Backspace".
     *
     * Modifier names: Meta (Cmd on macOS, Win on Windows), Control, Alt, Shift.
     * Joined by "+".
     */
    keys: z.string().min(1),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  dispatched: string;
}

const MODIFIER_BITS: Record<string, number> = {
  Alt: 1,
  Control: 2,
  Meta: 4,
  Shift: 8,
};

const KEY_INFO: Record<string, { code: string; vk: number; text?: string }> = {
  Enter: { code: "Enter", vk: 13, text: "\r" },
  Escape: { code: "Escape", vk: 27 },
  Tab: { code: "Tab", vk: 9, text: "\t" },
  Backspace: { code: "Backspace", vk: 8 },
  Delete: { code: "Delete", vk: 46 },
  ArrowUp: { code: "ArrowUp", vk: 38 },
  ArrowDown: { code: "ArrowDown", vk: 40 },
  ArrowLeft: { code: "ArrowLeft", vk: 37 },
  ArrowRight: { code: "ArrowRight", vk: 39 },
  Home: { code: "Home", vk: 36 },
  End: { code: "End", vk: 35 },
  PageUp: { code: "PageUp", vk: 33 },
  PageDown: { code: "PageDown", vk: 34 },
  Space: { code: "Space", vk: 32, text: " " },
};

function parseCombo(combo: string): { modifiers: number; key: string } {
  const parts = combo.split("+").map((p) => p.trim()).filter(Boolean);
  let modifiers = 0;
  let key = "";
  for (const p of parts) {
    if (p in MODIFIER_BITS) modifiers |= MODIFIER_BITS[p]!;
    else key = p;
  }
  if (!key) throw new Error(`Invalid key combo: "${combo}"`);
  return { modifiers, key };
}

function describeKey(key: string): { code: string; vk: number; text?: string; key: string } {
  const known = KEY_INFO[key];
  if (known) return { ...known, key };
  // single character
  if (key.length === 1) {
    const upper = key.toUpperCase();
    return { code: `Key${upper}`, vk: upper.charCodeAt(0), text: key, key };
  }
  return { code: key, vk: 0, key };
}

export const pressKeyTool: Tool<Input, Output> = {
  name: "press_key",
  description:
    'Dispatches a keyboard combination to the focused element. Examples: "Enter", "Escape", "Meta+K" (Cmd+K on macOS), "Control+Shift+P", "Alt+ArrowLeft". Useful for shortcuts, command palettes, dialogs.',
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const { modifiers, key } = parseCombo(input.keys);
    const info = describeKey(key);
    const c = cdp.raw();

    await c.Input.dispatchKeyEvent({
      type: "keyDown",
      key: info.key,
      code: info.code,
      windowsVirtualKeyCode: info.vk,
      nativeVirtualKeyCode: info.vk,
      text: info.text,
      unmodifiedText: info.text,
      modifiers,
    });
    await c.Input.dispatchKeyEvent({
      type: "keyUp",
      key: info.key,
      code: info.code,
      windowsVirtualKeyCode: info.vk,
      nativeVirtualKeyCode: info.vk,
      modifiers,
    });
    return { dispatched: input.keys };
  },
};
