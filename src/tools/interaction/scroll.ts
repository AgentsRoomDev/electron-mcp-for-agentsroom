import { z } from "zod";
import type { Tool } from "../types.js";
import { resolve } from "../selector.js";

const InputSchema = z
  .object({
    /** If provided, scroll this element into view. Otherwise scroll the page by `delta`. */
    selector: z.string().optional(),
    /** Scroll delta in pixels (positive = down/right). Ignored if `selector` is set. */
    deltaY: z.number().default(0),
    deltaX: z.number().default(0),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  scrollY: number;
  scrollX: number;
}

export const scrollTool: Tool<Input, Output> = {
  name: "scroll",
  description:
    "Scrolls the page. Either provide a `selector` (element scrolled into view, centered) or `deltaX`/`deltaY` (page scroll in pixels).",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    if (input.selector) {
      await resolve(cdp, input.selector);
      await cdp.evaluate(`(() => {
        const el = window.__electronMcpLastEl;
        if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      })()`);
    } else {
      await cdp.evaluate(`window.scrollBy(${input.deltaX}, ${input.deltaY})`);
    }
    return cdp.evaluate<Output>(`({ scrollY: window.scrollY, scrollX: window.scrollX })`);
  },
};
