import { defineConfig } from "tsup";

// The CLI shebang lives in src/cli.ts itself rather than as a banner here,
// so the library entries (index, extensions) stay clean.
export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    "extensions/index": "src/extensions/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  splitting: false,
  shims: true,
});
