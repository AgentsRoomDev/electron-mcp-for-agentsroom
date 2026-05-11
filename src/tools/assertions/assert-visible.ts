import { z } from "zod";
import type { Tool } from "../types.js";
import { ElectronMcpError } from "../../utils/errors.js";
import { buildResolverExpression } from "../selector.js";

const InputSchema = z
  .object({
    selector: z.string().min(1),
    /** Asserts the inverse: element is hidden or absent. */
    invert: z.boolean().default(false),
    timeoutMs: z.number().int().min(0).max(60_000).default(2000),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: true;
  visible: boolean;
  selector: string;
}

export const assertVisibleTool: Tool<Input, Output> = {
  name: "assert_visible",
  description:
    "Asserts that the element matching `selector` is visible (present + non-zero size + not display:none/visibility:hidden/opacity:0). Use `invert=true` to assert it is hidden or absent.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const expr = `(() => {
      const el = ${buildResolverExpression(input.selector)};
      if (!el) return false;
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      const style = window.getComputedStyle(el);
      if (style.display === 'none') return false;
      if (style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity || '1') === 0) return false;
      if (r && (r.width === 0 || r.height === 0)) return false;
      return true;
    })()`;

    const deadline = Date.now() + input.timeoutMs;
    let visible = await cdp.evaluate<boolean>(expr);
    while (visible !== !input.invert && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      visible = await cdp.evaluate<boolean>(expr);
    }

    const expected = !input.invert;
    if (visible !== expected) {
      throw new ElectronMcpError(
        "ASSERTION_FAILED",
        input.invert
          ? `Expected selector to be hidden/absent but it is visible: ${input.selector}`
          : `Expected selector to be visible but it is hidden/absent: ${input.selector}`,
        { selector: input.selector, invert: input.invert, visible },
      );
    }
    return { ok: true, visible, selector: input.selector };
  },
};
