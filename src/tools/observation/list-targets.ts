import { z } from "zod";
import type { Tool } from "../types.js";

const InputSchema = z.object({}).strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  attached: string;
  targets: Array<{ id: string; type: string; title: string; url: string }>;
}

export const listTargetsTool: Tool<Input, Output> = {
  name: "list_targets",
  description:
    "Lists all CDP targets exposed by the Electron app (typically one window per BrowserWindow plus utility processes). Mark which one is currently attached. Use `switch_target` to attach to a different one.",
  inputSchema: InputSchema,
  async handler(_input, { cdp }) {
    const attached = cdp.getTarget();
    const targets = await cdp.listTargets();
    return {
      attached: attached.id,
      targets: targets.map((t) => ({ id: t.id, type: t.type, title: t.title, url: t.url })),
    };
  },
};
