import type { AnyTool } from "../tools/types.js";

/**
 * Runtime registry that lets host code (libraries embedding the server)
 * inject extra tools into the server before it starts.
 *
 * Use `defineExtension({ name, tools })` then pass it via
 * `runServer({ extensions: [...] })`.
 */

export interface Extension {
  name: string;
  version?: string;
  description?: string;
  tools: AnyTool[];
}

export class ExtensionRegistry {
  private extensions = new Map<string, Extension>();

  register(ext: Extension): void {
    if (this.extensions.has(ext.name)) {
      throw new Error(`Extension "${ext.name}" is already registered.`);
    }
    this.extensions.set(ext.name, ext);
  }

  list(): Extension[] {
    return Array.from(this.extensions.values());
  }

  /** Returns all tools across all registered extensions. */
  allTools(): AnyTool[] {
    return this.list().flatMap((e) => e.tools);
  }
}

export function defineExtension(ext: Extension): Extension {
  return ext;
}
