import { describe, it, expect } from "vitest";
import { loggedInput, loggedOutput } from "../src/utils/redact.js";
import { TYPED_KEY_LOGGED } from "../src/tools/interaction/press-key.js";

// AgentsRoom #3191: the event log is a plain file, what an agent typed
// (often a password) must never read back from it.
describe("event log redaction", () => {
  it("keeps the length of a typed text, never the text", () => {
    const input = { selector: "#pw", text: "s3cret!", clear: false };
    expect(loggedInput("type", input)).toEqual({ selector: "#pw", clear: false, textLength: 7 });
    expect(loggedOutput("type", { typed: "s3cret!", selector: "#pw" })).toEqual({ selector: "#pw" });
  });

  it("masks a key that may be a typed character", () => {
    for (const keys of ["p", "Shift+P", "hunter2"]) {
      expect(loggedInput("press_key", { keys })).toEqual({ keys: TYPED_KEY_LOGGED });
      expect(loggedOutput("press_key", { dispatched: keys })).toEqual({ dispatched: TYPED_KEY_LOGGED });
    }
  });

  it("keeps named keys and shortcuts", () => {
    for (const keys of ["Enter", "Meta+K", "Control+Shift+P", "Alt+ArrowLeft"]) {
      expect(loggedInput("press_key", { keys })).toEqual({ keys });
    }
  });

  it("leaves the other tools alone", () => {
    const input = { selector: "#go" };
    expect(loggedInput("click", input)).toBe(input);
  });
});
