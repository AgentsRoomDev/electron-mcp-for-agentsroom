import { describe, it, expect } from "vitest";
import { pickTarget } from "../src/cdp/targets.js";
import { ElectronMcpError } from "../src/utils/errors.js";

const targets = [
  { id: "a", title: "About blank", url: "about:blank", type: "page" as const },
  { id: "b", title: "Main window", url: "file:///app/index.html", type: "page" as const },
  { id: "c", title: "Service Worker", url: "chrome-extension://abc/sw.js", type: "service_worker" as const },
];

describe("pickTarget", () => {
  it("throws when there are no targets", () => {
    expect(() => pickTarget([])).toThrow(ElectronMcpError);
  });

  it("returns the explicit target when preferredId matches", () => {
    expect(pickTarget(targets, "c").id).toBe("c");
  });

  it("throws when preferredId does not match any target", () => {
    expect(() => pickTarget(targets, "missing")).toThrow(/not found/);
  });

  it("prefers a non-blank page target", () => {
    expect(pickTarget(targets).id).toBe("b");
  });

  it("falls back to the first page target when all are blank", () => {
    const blanks = [
      { id: "a", title: "", url: "about:blank", type: "page" as const },
      { id: "b", title: "", url: "about:blank", type: "page" as const },
    ];
    expect(pickTarget(blanks).id).toBe("a");
  });

  it("falls back to non-page targets when no page targets exist", () => {
    const noPages = [{ id: "x", title: "", url: "", type: "service_worker" as const }];
    expect(pickTarget(noPages).id).toBe("x");
  });
});
