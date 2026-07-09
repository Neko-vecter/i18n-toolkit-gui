import { contextBridge, ipcRenderer } from "electron";
import type { RebuildPayload, SaveTranslationsPayload } from "../shared/types.js";

const api = {
  getInitialProject: () => ipcRenderer.invoke("project:getInitial"),
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  openProject: (rootPath: string) => ipcRenderer.invoke("project:open", rootPath),
  loadDocument: (projectRoot: string, language: string, relativePath: string) =>
    ipcRenderer.invoke("document:load", { projectRoot, language, relativePath }),
  saveTranslations: (payload: SaveTranslationsPayload) =>
    ipcRenderer.invoke("document:saveTranslations", payload),
  rebuildDocument: (payload: RebuildPayload) => ipcRenderer.invoke("document:rebuild", payload)
};

contextBridge.exposeInMainWorld("i18nToolkit", api);

export type I18nToolkitApi = typeof api;
