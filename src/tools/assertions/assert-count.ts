import { z } from "zod";
import type { Tool } from "../types.js";
import { ElectronMcpError } from "../../utils/errors.js";

const InputSchema = z
  .object({
    /** Raw CSS selector (no css= prefix needed). */
    selector: z.string().min(1),
    expected: z.number().int().min(0),
    /** Match mode for the count. */
    mode: z.enum(["equals", "atLeast", "atMost"]).default("equals"),
    timeoutMs: z.number().int().min(0).max(60_000).default(2000),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: true;
  actual: number;
  expected: number;
  mode: "equals" | "atLeast" | "atMost";
}

export const assertCountTool: Tool<Input, Output> = {
  name: "assert_count",
  description:
    "Asserts the number of elements matching `selector`. Modes: `equals` (default), `atLeast`, `atMost`. Polls until the expected count holds or `timeoutMs` elapses.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const expr = `document.querySelectorAll(${JSON.stringify(input.selector)}).length`;
    const check = (n: number): boolean => {
      if (input.mode === "equals") return n === input.expected;
      if (input.mode === "atLeast") return n >= input.expected;
      return n <= input.expected;
    };

    const deadline = Date.now() + input.timeoutMs;
    let n = await cdp.evaluate<number>(expr);
    while (!check(n) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      n = await cdp.evaluate<number>(expr);
    }
    if (!check(n)) {
      throw new ElectronMcpError(
        "ASSERTION_FAILED",
        `assert_count(${input.mode}=${input.expected}) failed: actual ${n}`,
        { selector: input.selector, actual: n, expected: input.expected, mode: input.mode },
      );
    }
    return { ok: true, actual: n, expected: input.expected, mode: input.mode };
  },
};
