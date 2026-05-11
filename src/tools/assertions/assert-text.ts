import { z } from "zod";
import type { Tool } from "../types.js";
import { resolve } from "../selector.js";
import { ElectronMcpError } from "../../utils/errors.js";

const InputSchema = z
  .object({
    selector: z.string().min(1),
    /** Expected text. */
    expected: z.string(),
    /** Match mode. */
    mode: z.enum(["equals", "contains", "regex"]).default("contains"),
    timeoutMs: z.number().int().min(0).max(60_000).default(5000),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: true;
  actual: string;
  expected: string;
  mode: "equals" | "contains" | "regex";
}

export const assertTextTool: Tool<Input, Output> = {
  name: "assert_text",
  description:
    "Asserts that the textContent of the matched element satisfies `expected`. Modes: `equals`, `contains` (default), `regex`. Throws ASSERTION_FAILED with `actual` and `expected` if mismatch.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    await resolve(cdp, input.selector, { timeoutMs: input.timeoutMs });
    const actual = await cdp.evaluate<string>(`(() => {
      const el = window.__electronMcpLastEl;
      return el ? (el.textContent || '').trim() : '';
    })()`);
    let pass = false;
    if (input.mode === "equals") pass = actual === input.expected;
    else if (input.mode === "contains") pass = actual.includes(input.expected);
    else pass = new RegExp(input.expected).test(actual);

    if (!pass) {
      throw new ElectronMcpError(
        "ASSERTION_FAILED",
        `assert_text(${input.mode}) failed`,
        { selector: input.selector, expected: input.expected, actual },
      );
    }
    return { ok: true, actual, expected: input.expected, mode: input.mode };
  },
};
