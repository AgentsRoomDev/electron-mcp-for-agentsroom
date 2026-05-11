import { z } from "zod";
import type { Tool } from "../types.js";
import { ElectronMcpError } from "../../utils/errors.js";

const InputSchema = z
  .object({
    expected: z.string(),
    mode: z.enum(["equals", "contains", "regex"]).default("contains"),
    /** Which part of the URL to compare. */
    field: z.enum(["href", "pathname", "search", "hash", "origin"]).default("pathname"),
    timeoutMs: z.number().int().min(0).max(60_000).default(2000),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  ok: true;
  actual: string;
  expected: string;
  mode: "equals" | "contains" | "regex";
  field: "href" | "pathname" | "search" | "hash" | "origin";
}

export const assertRouteTool: Tool<Input, Output> = {
  name: "assert_route",
  description:
    "Asserts that the current URL field matches `expected`. Use `field=pathname` (default) for client-side routing, `href` for the full URL, `hash` for hash-based routing.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const expr = `location[${JSON.stringify(input.field)}]`;
    const check = (v: string): boolean => {
      if (input.mode === "equals") return v === input.expected;
      if (input.mode === "contains") return v.includes(input.expected);
      return new RegExp(input.expected).test(v);
    };
    const deadline = Date.now() + input.timeoutMs;
    let actual = await cdp.evaluate<string>(expr);
    while (!check(actual) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      actual = await cdp.evaluate<string>(expr);
    }
    if (!check(actual)) {
      throw new ElectronMcpError(
        "ASSERTION_FAILED",
        `assert_route(${input.field}, ${input.mode}) failed`,
        { actual, expected: input.expected, mode: input.mode, field: input.field },
      );
    }
    return { ok: true, actual, expected: input.expected, mode: input.mode, field: input.field };
  },
};
