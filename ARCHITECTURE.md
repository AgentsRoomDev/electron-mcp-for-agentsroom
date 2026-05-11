# Architecture

`electron-mcp-server` has three layers, top to bottom:

```text
┌──────────────────────────────────────────────────────┐
│ MCP layer  (src/server.ts, src/cli.ts)               │
│   - @modelcontextprotocol/sdk McpServer over stdio   │
│   - adapts native tools into MCP tool definitions    │
│   - formats results / errors as MCP content blocks   │
├──────────────────────────────────────────────────────┤
│ Tools layer  (src/tools/*)                           │
│   - native tools with Zod input schemas              │
│   - composed on top of CdpClient                     │
│   - extension registry for in-process additions      │
├──────────────────────────────────────────────────────┤
│ CDP layer  (src/cdp/*)                               │
│   - chrome-remote-interface wrapper                  │
│   - target listing/selection, reconnect handling     │
│   - console buffer, runtime evaluate, screenshot     │
└──────────────────────────────────────────────────────┘
```

The dependency direction is strictly top → down. The CDP layer knows nothing
about MCP; tools know nothing about MCP framing; the server knows nothing
about CDP internals.

## Why CDP and not Playwright?

We considered wrapping `playwright-core`, but:

1. **Footprint.** Playwright bundles its own browsers. `chrome-remote-interface`
   is a 60 KB JSON-RPC client. Since we attach to the user's already-running
   Electron, we don't need to ship a browser.
2. **Multi-window.** Electron apps frequently spawn multiple BrowserWindows.
   With CDP we treat each window as a peer target and let the agent switch
   between them via `switch_target`.
3. **Stability.** CDP is stable across Electron versions back to 12.

## Why Zod schemas (then JSON Schema)?

The MCP SDK accepts Zod object shapes and infers JSON Schema for the wire
protocol. We keep Zod as the source of truth so:

- runtime validation happens in the same shape clients see
- tool authors get full TypeScript inference inside their handlers
- error messages match field paths users see

The server adapter (`src/server.ts`) extracts `inputSchema.shape` for
`ZodObject` schemas and passes a single-field wrapper for non-object schemas.

## Lifecycle of a tool call

```text
client → MCP frame "tools/call name=click args={selector:...}"
         │
         ▼
server.ts → ensureConnected()  ─── lazy CDP attach if needed
         │
         ▼
tool.inputSchema.parse(args)   ─── Zod validation (strict mode)
         │
         ▼
tool.handler(args, ctx)        ─── runs against CdpClient
         │
         ▼
formatResult(name, output)     ─── MCP content blocks (text, image, JSON)
         │
         ▼
client ← MCP response
```

Errors thrown by the handler are caught and rendered with `formatError`,
which preserves the typed `ElectronMcpError.code` so clients can branch
without parsing free-form text.

## Selector resolution

`src/tools/selector.ts` builds a JS expression that runs in the renderer:

- `css=...` and bare strings → `document.querySelector(value)`
- `testid=...`               → `document.querySelector('[data-testid=...]')`
- `text=...`                 → walk `body *`, first node whose trimmed
                                textContent equals the literal

We deliberately avoid the CDP DOM domain for these queries because:

- text matching is awkward in DOM events
- repeated queries are 5-10× slower than `Runtime.evaluate` round-trips

The resolver also stashes the matched element on `window.__electronMcpLastEl`
so subsequent operations (click, type, screenshot) can reuse it without
re-querying.

## Extension model

Extensions are added in-process via `defineExtension` and passed to
`runServer`. They register as first-class MCP tools alongside the built-in
catalog.

```ts
runServer({ port: 9223, extensions: [myExt] });
```

This is intended for embedders who run `electron-mcp-server` from their
own process (a CI runner, a custom desktop app) and want to surface extra
domain-specific tools without forking the package.

## Multi-window strategy

`list_targets` enumerates everything the debug endpoint exposes
(BrowserWindows, service workers, background pages). `switch_target` tears
down the current CDP connection and opens a new one against the chosen
target id. Console buffers are reset on switch — this is intentional, so
the agent's mental model of "what was logged here" doesn't bleed across
windows.

## Logging

Logs go to **stderr only**. The server speaks MCP over stdio; anything on
stdout that isn't a valid frame breaks the client. `src/utils/logger.ts`
routes pino to file descriptor 2 explicitly. Use
`ELECTRON_MCP_LOG_LEVEL=debug` for verbose tracing.
