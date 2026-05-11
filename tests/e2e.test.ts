/**
 * End-to-end test: spawns the minimal Electron example with a CDP debug port,
 * runs the full tool catalog through it, and verifies expected outcomes.
 *
 * This test is SKIPPED unless the env var ELECTRON_MCP_E2E is truthy. Reason:
 * spawning Electron in CI requires Xvfb on Linux and Electron itself as a dev
 * dependency, both of which are configured outside the unit-test fast path.
 *
 * Run locally with:
 *   ELECTRON_MCP_E2E=1 npm test
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { CdpClient } from "../src/cdp/client.js";
import { observationTools } from "../src/tools/observation/index.js";
import { interactionTools } from "../src/tools/interaction/index.js";
import { assertionTools } from "../src/tools/assertions/index.js";
import { logger } from "../src/utils/logger.js";

const SHOULD_RUN = !!process.env.ELECTRON_MCP_E2E;
const PORT = Number(process.env.ELECTRON_MCP_E2E_PORT ?? 9999);
const APP_DIR = resolve(__dirname, "..", "examples", "minimal-electron-app");

const describeOrSkip = SHOULD_RUN ? describe : describe.skip;

describeOrSkip("electron-mcp-server e2e", () => {
  let proc: ChildProcess | null = null;
  let cdp: CdpClient;

  beforeAll(async () => {
    proc = spawn(
      "npx",
      ["electron", ".", `--remote-debugging-port=${PORT}`, "--no-sandbox"],
      { cwd: APP_DIR, stdio: "ignore", env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "1" } },
    );
    cdp = new CdpClient({ port: PORT, waitForTargetMs: 30_000 });
    await cdp.connect();
  }, 60_000);

  afterAll(async () => {
    await cdp?.close();
    proc?.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 200));
    if (proc && !proc.killed) proc.kill("SIGKILL");
  });

  const findTool = (name: string) => {
    const all = [...observationTools, ...interactionTools, ...assertionTools];
    const t = all.find((t) => t.name === name);
    if (!t) throw new Error(`tool not found: ${name}`);
    return t;
  };

  it("get_state returns the example app's URL", async () => {
    const out = (await findTool("get_state").handler({}, { cdp, logger })) as {
      target: { title: string; url: string };
    };
    expect(out.target.url).toContain("index.html");
  });

  it("dom_query finds elements by testid", async () => {
    const out = (await findTool("dom_query").handler(
      { selector: "testid=title", limit: 1, maxOuterHtmlLength: 1000, includeVisibility: true },
      { cdp, logger },
    )) as { count: number; matches: Array<{ tagName: string }> };
    expect(out.count).toBe(1);
    expect(out.matches[0]!.tagName).toBe("H1");
  });

  it("type + click + assert flow works", async () => {
    await findTool("type").handler(
      {
        selector: "testid=name-input",
        text: "AgentsRoom",
        clear: true,
        delayMs: 0,
        pressEnter: false,
        timeoutMs: 5000,
      },
      { cdp, logger },
    );
    await findTool("click").handler(
      {
        selector: "testid=greet-button",
        button: "left",
        clickCount: 1,
        modifiers: [],
        timeoutMs: 5000,
        scrollIntoView: true,
      },
      { cdp, logger },
    );
    await findTool("wait_for_selector").handler(
      { selector: "testid=greeting", state: "present", timeoutMs: 3000, pollMs: 100 },
      { cdp, logger },
    );
    const out = (await findTool("assert_text").handler(
      { selector: "testid=greeting", expected: "Hello, AgentsRoom!", mode: "equals", timeoutMs: 2000 },
      { cdp, logger },
    )) as { ok: true; actual: string };
    expect(out.actual).toBe("Hello, AgentsRoom!");
  });

  it("counter increments via repeated click", async () => {
    for (let i = 0; i < 3; i++) {
      await findTool("click").handler(
        {
          selector: "testid=counter-button",
          button: "left",
          clickCount: 1,
          modifiers: [],
          timeoutMs: 5000,
          scrollIntoView: true,
        },
        { cdp, logger },
      );
    }
    const out = (await findTool("assert_text").handler(
      { selector: "testid=counter-value", expected: "3", mode: "equals", timeoutMs: 2000 },
      { cdp, logger },
    )) as { actual: string };
    expect(out.actual).toBe("3");
  });

  it("screenshot returns a base64 PNG", async () => {
    const out = (await findTool("screenshot").handler(
      { format: "png", fullPage: false },
      { cdp, logger },
    )) as { data: string; format: string };
    expect(out.format).toBe("png");
    expect(typeof out.data).toBe("string");
    expect(out.data.length).toBeGreaterThan(100);
  });
});
