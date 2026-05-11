import { z } from "zod";
import type { Tool } from "../types.js";

const InputSchema = z
  .object({
    targetId: z.string().min(1),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  attached: { id: string; url: string; title: string; type: string };
}

export const switchTargetTool: Tool<Input, Output> = {
  name: "switch_target",
  description:
    "Detach from the current CDP target and attach to a different one (e.g. another BrowserWindow). Use `list_targets` to find target ids.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    await cdp.switchTarget(input.targetId);
    const t = cdp.getTarget();
    return { attached: { id: t.id, url: t.url, title: t.title, type: t.type } };
  },
};
