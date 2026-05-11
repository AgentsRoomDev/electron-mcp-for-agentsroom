import { z } from "zod";
import type { Tool } from "../types.js";
import { ElectronMcpError } from "../../utils/errors.js";

const InputSchema = z
  .object({
    ignoreCache: z.boolean().default(false),
    waitForLoad: z.boolean().default(true),
    timeoutMs: z.number().int().min(0).max(60_000).default(15_000),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  reloaded: boolean;
  loaded: boolean;
}

export const reloadTool: Tool<Input, Output> = {
  name: "reload",
  description:
    "Reloads the current renderer target via CDP Page.reload. Unlike `navigate`, this keeps the existing CDP target attached, so the MCP session stays alive across the reload. Use this to pick up dev-server changes when HMR is disabled.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const c = cdp.raw();
    const loadPromise = input.waitForLoad
      ? new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(
              new ElectronMcpError(
                "TIMEOUT",
                `reload did not fire load event within ${input.timeoutMs}ms`,
              ),
            );
          }, input.timeoutMs);
          c.once("Page.loadEventFired", () => {
            clearTimeout(timer);
            resolve();
          });
        })
      : Promise.resolve();

    await c.Page.reload({ ignoreCache: input.ignoreCache });
    await loadPromise;

    return { reloaded: true, loaded: input.waitForLoad };
  },
};
