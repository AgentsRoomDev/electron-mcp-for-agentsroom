import { describe, it, expect } from "vitest";
import { builtinTools } from "../src/tools/index.js";

describe("builtin tools registry", () => {
  it("registers a non-empty list", () => {
    expect(builtinTools.length).toBeGreaterThan(10);
  });

  it("has unique tool names", () => {
    const names = builtinTools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every tool has a non-empty description", () => {
    for (const t of builtinTools) {
      expect(t.description, `tool ${t.name} missing description`).toBeTruthy();
      expect(t.description.length, `tool ${t.name} description too short`).toBeGreaterThan(20);
    }
  });

  it("every input schema parses an empty object or returns a parse error", () => {
    // We only check the schema is callable and a Zod schema; the actual
    // shapes are tested via the individual tool tests.
    for (const t of builtinTools) {
      expect(typeof t.inputSchema.parse).toBe("function");
    }
  });
});
