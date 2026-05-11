import { describe, it, expect } from "vitest";
import { ElectronMcpError, isElectronMcpError, wrapError } from "../src/utils/errors.js";

describe("ElectronMcpError", () => {
  it("carries a code, message, and details", () => {
    const err = new ElectronMcpError("SELECTOR_NOT_FOUND", "missing", { selector: ".x" });
    expect(err.code).toBe("SELECTOR_NOT_FOUND");
    expect(err.message).toBe("missing");
    expect(err.details).toEqual({ selector: ".x" });
  });

  it("serializes via toJSON", () => {
    const err = new ElectronMcpError("TIMEOUT", "boom");
    const json = err.toJSON();
    expect(json.name).toBe("ElectronMcpError");
    expect(json.code).toBe("TIMEOUT");
    expect(json.message).toBe("boom");
  });

  it("isElectronMcpError narrows correctly", () => {
    const err = new ElectronMcpError("INTERNAL", "x");
    expect(isElectronMcpError(err)).toBe(true);
    expect(isElectronMcpError(new Error("x"))).toBe(false);
    expect(isElectronMcpError("string")).toBe(false);
    expect(isElectronMcpError(null)).toBe(false);
  });

  it("wrapError preserves existing ElectronMcpError instances", () => {
    const original = new ElectronMcpError("TIMEOUT", "x");
    expect(wrapError(original)).toBe(original);
  });

  it("wrapError converts plain Error to ElectronMcpError with given code", () => {
    const wrapped = wrapError(new Error("boom"), "CDP_ERROR");
    expect(wrapped.code).toBe("CDP_ERROR");
    expect(wrapped.message).toBe("boom");
  });

  it("wrapError handles non-Error values", () => {
    const wrapped = wrapError("a string");
    expect(wrapped.code).toBe("INTERNAL");
    expect(wrapped.message).toBe("a string");
  });
});
