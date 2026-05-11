# Minimal Electron example

A tiny single-page Electron app used to demonstrate and test
`electron-mcp-server`. It has no dependencies beyond Electron itself.

## Run it

```bash
cd packages/electron-mcp/examples/minimal-electron-app
npm install
npm run start:debug   # exposes CDP on 127.0.0.1:9223
```

Then in another terminal, drive it from your MCP client:

```jsonc
{
  "mcpServers": {
    "electron": {
      "command": "npx",
      "args": ["electron-mcp-server", "--port", "9223"]
    }
  }
}
```

## What's wired

The page exposes a few `data-testid` anchors so you can practice the full
selector language:

| testid           | Element             | Useful for                                |
| ---------------- | ------------------- | ----------------------------------------- |
| `title`          | `<h1>`              | `assert_text`, `screenshot` selector      |
| `name-input`     | text input          | `type`                                    |
| `greet-button`   | button              | `click`                                   |
| `greeting`       | greeting box        | `wait_for_selector`, `assert_visible`     |
| `counter-button` | button              | `click` (multi-click via `clickCount: 2`) |
| `counter-value`  | counter span        | `assert_text`                             |
| `todo-input`     | text input          | `type` + `pressEnter`                     |
| `todo-add`       | button              | `click`                                   |
| `todo-item`      | list items (many)   | `assert_count`                            |

## Sample script

```text
1. wait_for_selector { selector: "testid=title" }
2. type             { selector: "testid=name-input", text: "AgentsRoom" }
3. click            { selector: "testid=greet-button" }
4. assert_text      { selector: "testid=greeting", expected: "Hello, AgentsRoom!", mode: "equals" }
5. click            { selector: "testid=counter-button", clickCount: 1 }
6. click            { selector: "testid=counter-button" }
7. assert_text      { selector: "testid=counter-value", expected: "2", mode: "equals" }
8. type             { selector: "testid=todo-input", text: "Buy milk", pressEnter: true }
9. assert_count     { selector: "[data-testid='todo-item']", expected: 1 }
```
