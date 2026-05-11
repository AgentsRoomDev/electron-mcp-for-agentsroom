import { z } from "zod";
import type { Tool } from "../types.js";
import { resolve } from "../selector.js";
import { ElectronMcpError } from "../../utils/errors.js";

const InputSchema = z
  .object({
    format: z.enum(["png", "jpeg"]).default("png"),
    quality: z.number().int().min(0).max(100).optional(),
    selector: z.string().optional(),
    fullPage: z.boolean().default(false),
  })
  .strict();
type Input = z.infer<typeof InputSchema>;

interface Output {
  format: "png" | "jpeg";
  width: number;
  height: number;
  /** Base64-encoded image content. */
  data: string;
}

export const screenshotTool: Tool<Input, Output> = {
  name: "screenshot",
  description:
    "Captures a screenshot of the current page. Optionally restrict to a single element via `selector` or capture the full scrollable page via `fullPage`.",
  inputSchema: InputSchema,
  async handler(input, { cdp }) {
    const c = cdp.raw();
    let clip:
      | { x: number; y: number; width: number; height: number; scale: number }
      | undefined;

    if (input.selector) {
      await resolve(cdp, input.selector);
      const rect = await cdp.evaluate<{ x: number; y: number; width: number; height: number } | null>(`
        (() => {
          const el = window.__electronMcpLastEl;
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
        })()
      `);
      if (!rect || rect.width === 0 || rect.height === 0) {
        throw new ElectronMcpError(
          "SELECTOR_NOT_FOUND",
          "Selector resolved to an element with zero size; cannot screenshot.",
          { selector: input.selector },
        );
      }
      clip = { ...rect, scale: 1 };
    }

    const { data } = await c.Page.captureScreenshot({
      format: input.format,
      quality: input.format === "jpeg" ? input.quality ?? 80 : undefined,
      captureBeyondViewport: input.fullPage,
      clip,
    });

    const dimensions = clip
      ? { width: Math.round(clip.width), height: Math.round(clip.height) }
      : await cdp.evaluate<{ width: number; height: number }>(
          `({ width: window.innerWidth, height: window.innerHeight })`,
        );

    return {
      format: input.format,
      width: dimensions.width,
      height: dimensions.height,
      data,
    };
  },
};
