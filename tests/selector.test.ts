import { describe, it, expect } from "vitest";
import { buildResolverExpression } from "../src/tools/selector.js";

describe("buildResolverExpression", () => {
  it("treats bare strings as CSS", () => {
    const expr = buildResolverExpression(".foo > .bar");
    expect(expr).toContain('document.querySelector(".foo > .bar")');
    expect(expr).toContain("window.__electronMcpLastEl");
  });

  it("handles css= prefix", () => {
    const expr = buildResolverExpression("css=.foo");
    expect(expr).toContain('document.querySelector(".foo")');
  });

  it("handles testid= prefix", () => {
    const expr = buildResolverExpression("testid=primary");
    expect(expr).toContain("data-testid=");
    expect(expr).toContain('"primary"');
  });

  it("handles text= prefix", () => {
    const expr = buildResolverExpression("text=Save");
    expect(expr).toContain('"Save"');
    expect(expr).toContain("document.querySelectorAll('body *')");
  });

  it("escapes selector values via JSON.stringify", () => {
    const expr = buildResolverExpression('css=.weird"quote');
    // The value is JSON-encoded so the renderer evaluation is safe.
    expect(expr).toContain(JSON.stringify('.weird"quote'));
  });
});
