// Plain CommonJS so it runs under Electron without a build step.
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 640,
    title: "electron-mcp example",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
