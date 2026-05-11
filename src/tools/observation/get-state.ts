import { z } from "zod";
import type { Tool } from "../types.js";

const InputSchema = z.object({}).strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  target: { id: string; url: string; title: string; type: string };
  viewport: { width: number; height: number; devicePixelRatio: number };
  userAgent: string;
  readyState: string;
}

export const getStateTool: Tool<Input, Output> = {
  name: "get_state",
  description:
    "Returns a snapshot of the current Electron page: attached target, viewport size, user agent, and document ready state.",
  inputSchema: InputSchema,
  async handler(_input, { cdp }) {
    const target = cdp.getTarget();
    const browserState = await cdp.evaluate<{
      width: number;
      height: number;
      dpr: number;
      ua: string;
      ready: string;
    }>(`(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
      ua: navigator.userAgent,
      ready: document.readyState,
    }))()`);
    return {
      target: { id: target.id, url: target.url, title: target.title, type: target.type },
      viewport: {
        width: browserState.width,
        height: browserState.height,
        devicePixelRatio: browserState.dpr,
      },
      userAgent: browserState.ua,
      readyState: browserState.ready,
    };
  },
};
