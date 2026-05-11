import { z } from "zod";
import type { Tool } from "../types.js";
import { ElectronMcpError } from "../../utils/errors.js";

const InputSchema = z
  .object({
    /** URL to load. Can be http://, https://, file://, or an in-app route. */
    url: z.string().min(1),
    /** Wait for `load` event before returning. */
    waitForLoad: z.boolean().default(true),
    /** Maximum time to wait for the load event. */
    timeoutMs: z.number().int().min(0).max(60_000).default(15_000),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  url: string;
  loaded: boolean;
}

export const navigateTool: Tool<Input, Output> = {
  name: "navigate",
  description:
    "Navigates the renderer to a new URL. For in-app routing (React Router, Vue Router), prefer pressing the corresponding link via `click` since hard navigation discards SPA state. This tool fires Page.navigate, which is closer to typing in the address bar.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const c = cdp.raw();
    const loadPromise = input.waitForLoad
      ? new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            reject(
              new ElectronMcpError("TIMEOUT", `navigate did not fire load event within ${input.timeoutMs}ms`),
            );
          }, input.timeoutMs);
          c.once("Page.loadEventFired", () => {
            clearTimeout(timer);
            resolve();
          });
        })
      : Promise.resolve();

    await c.Page.navigate({ url: input.url });
    await loadPromise;

    return { url: input.url, loaded: input.waitForLoad };
  },
};
