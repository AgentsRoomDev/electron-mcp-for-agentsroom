import { z } from "zod";
import type { Tool } from "../types.js";

const InputSchema = z.object({}).strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  href: string;
  pathname: string;
  search: string;
  hash: string;
  origin: string;
  /** History entry count (best-effort, browser limits apply). */
  historyLength: number;
}

export const getRouteTool: Tool<Input, Output> = {
  name: "get_route",
  description:
    "Returns the current renderer URL parts (href, pathname, search, hash, origin) and history length. Useful for asserting client-side routing changes.",
  inputSchema: InputSchema,
  async handler(_input, { cdp }) {
    return cdp.evaluate<Output>(`({
      href: location.href,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      origin: location.origin,
      historyLength: history.length,
    })`);
  },
};
