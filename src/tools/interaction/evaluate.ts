import { z } from "zod";
import type { Tool } from "../types.js";

const InputSchema = z
  .object({
    expression: z.string().min(1),
    awaitPromise: z.boolean().default(true),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  value: unknown;
}

export const evaluateTool: Tool<Input, Output> = {
  name: "evaluate",
  description:
    "Evaluates a JavaScript expression in the renderer's main world and returns the result by value. Useful to read DOM state directly (e.g. `document.title`, `document.querySelector('input').placeholder`), call exposed APIs, or trigger an in-page reload (`location.reload()`). The expression runs as if pasted into the DevTools console.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const value = await cdp.evaluate(input.expression, input.awaitPromise);
    return { value };
  },
};
