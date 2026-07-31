import { describe, it, expect } from "vitest";
import * as api from "../src/index.js";
import { runServer, defineExtension, z } from "../src/index.js";

describe("public API surface", () => {
  // Guards the README programmatic-usage example:
  //   import { runServer, defineExtension, z } from "electron-mcp-server";
  it("re-exports zod as z", () => {
    expect(api.z).toBeDefined();
    expect(z).toBe(api.z);

    const schema = z.object({ n: z.number() });
    expect(schema.parse({ n: 1 })).toEqual({ n: 1 });
    expect(() => schema.parse({ n: "nope" })).toThrow();
  });

  it("exposes the documented entry points", () => {
    expect(typeof runServer).toBe("function");
    expect(typeof defineExtension).toBe("function");
  });
});
