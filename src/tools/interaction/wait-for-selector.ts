import { z } from "zod";
import type { Tool } from "../types.js";
import { resolve } from "../selector.js";

const InputSchema = z
  .object({
    selector: z.string().min(1),
    /** Wait for the element to be present (default) or hidden/removed. */
    state: z.enum(["present", "hidden"]).default("present"),
    timeoutMs: z.number().int().min(0).max(120_000).default(10_000),
    pollMs: z.number().int().min(50).max(2000).default(150),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  found: boolean;
  selector: string;
  state: "present" | "hidden";
  elapsedMs: number;
}

export const waitForSelectorTool: Tool<Input, Output> = {
  name: "wait_for_selector",
  description:
    "Polls until `selector` is present (or hidden, depending on `state`). Returns elapsed time. Use before interacting with elements that appear after a route change, async fetch, or animation.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const start = Date.now();
    if (input.state === "present") {
      await resolve(cdp, input.selector, { timeoutMs: input.timeoutMs, pollMs: input.pollMs });
      return { found: true, selector: input.selector, state: "present", elapsedMs: Date.now() - start };
    }
    // hidden: wait until selector no longer matches
    const deadline = Date.now() + input.timeoutMs;
    while (Date.now() < deadline) {
      const r = await resolve(cdp, input.selector, { required: false, timeoutMs: 0 });
      if (!r.tagName) return { found: false, selector: input.selector, state: "hidden", elapsedMs: Date.now() - start };
      await new Promise((r) => setTimeout(r, input.pollMs));
    }
    return { found: true, selector: input.selector, state: "hidden", elapsedMs: Date.now() - start };
  },
};
