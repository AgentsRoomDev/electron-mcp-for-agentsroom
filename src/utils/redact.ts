import { pressKeyLogged } from "../tools/interaction/press-key.js";

/**
 * What the event log keeps of what an agent typed: never the value. The log
 * is a plain JSONL file under `~/.agentsroom/mcp-events/` and that text is
 * often a password (AgentsRoom #3191, CWE-532). `type` keeps the length of
 * its text, `press_key` masks a key that may be a typed character.
 */
export function loggedInput(tool: string, input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const fields = input as Record<string, unknown>;
  if (tool === "type") {
    const { text, ...rest } = fields;
    return { ...rest, textLength: String(text ?? "").length };
  }
  if (tool === "press_key" && "keys" in fields) return { ...fields, keys: pressKeyLogged(fields.keys) };
  return input;
}

/** The same rule for what the tool answered: `type` echoes its text, `press_key` its keys. */
export function loggedOutput(tool: string, output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const fields = output as Record<string, unknown>;
  if (tool === "type") {
    const { typed: _typed, ...rest } = fields;
    return rest;
  }
  if (tool === "press_key" && "dispatched" in fields) return { ...fields, dispatched: pressKeyLogged(fields.dispatched) };
  return output;
}
