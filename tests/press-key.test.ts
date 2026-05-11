import { describe, it, expect } from "vitest";
import { pressKeyTool } from "../src/tools/interaction/press-key.js";

describe("press_key schema", () => {
  it("requires keys", () => {
    expect(() => pressKeyTool.inputSchema.parse({})).toThrow();
  });
  it("accepts simple key", () => {
    expect(pressKeyTool.inputSchema.parse({ keys: "Enter" })).toEqual({ keys: "Enter" });
  });
  it("accepts modifier combos", () => {
    expect(pressKeyTool.inputSchema.parse({ keys: "Meta+K" })).toEqual({ keys: "Meta+K" });
  });
});
