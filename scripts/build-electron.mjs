import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";

const compileElectron = spawnSync(
  process.execPath,
  ["./node_modules/typescript/bin/tsc", "-p", "tsconfig.electron.json"],
  {
    stdio: "inherit",
    shell: false
  }
);

if (compileElectron.status !== 0) {
  process.exit(compileElectron.status ?? 1);
}

await fs.mkdir("dist-electron/preload", { recursive: true });
await fs.writeFile(
  "dist-electron/preload/preload.cjs",
  `"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getInitialProject: () => ipcRenderer.invoke("project:getInitial"),
  getLastProjectPath: () => ipcRenderer.invoke("project:getLastPath"),
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  openProject: (rootPath) => ipcRenderer.invoke("project:open", rootPath),
  scanFiles: (projectRoot, mode, language) =>
    ipcRenderer.invoke("project:scanFiles", { projectRoot, mode, language }),
  loadDocument: (projectRoot, mode, language, relativePath) =>
    ipcRenderer.invoke("document:load", { projectRoot, mode, language, relativePath }),
  saveTranslations: (payload) => ipcRenderer.invoke("document:saveTranslations", payload),
  rebuildDocument: (payload) => ipcRenderer.invoke("document:rebuild", payload),
  onOpenProjectRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("project:openRequest", listener);
    return () => {
      ipcRenderer.removeListener("project:openRequest", listener);
    };
  },
  onOpenConfigRequest: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("config:openRequest", listener);
    return () => {
      ipcRenderer.removeListener("config:openRequest", listener);
    };
  }
};

contextBridge.exposeInMainWorld("i18nToolkit", api);
`,
  "utf8"
);
