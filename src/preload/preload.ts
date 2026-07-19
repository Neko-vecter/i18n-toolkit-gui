import { contextBridge, ipcRenderer } from "electron";
import type { ApiConfig, ProjectMode, RebuildPayload, SaveTranslationsPayload } from "../shared/types.js";

const api = {
  getApiConfig: (): Promise<ApiConfig> => ipcRenderer.invoke("api:getConfig"),
  getInitialProject: () => ipcRenderer.invoke("project:getInitial"),
  getLastProjectPath: () => ipcRenderer.invoke("project:getLastPath"),
  getRecentProjectPaths: () => ipcRenderer.invoke("project:getRecentPaths"),
  chooseProject: () => ipcRenderer.invoke("project:choose"),
  openProject: (rootPath: string) => ipcRenderer.invoke("project:open", rootPath),
  closeProject: () => ipcRenderer.invoke("project:close"),
  platform: process.platform,
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowMaximize: () => ipcRenderer.invoke("window:maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  scanFiles: (projectRoot: string, mode: ProjectMode, language: string) =>
    ipcRenderer.invoke("project:scanFiles", { projectRoot, mode, language }),
  loadDocument: (projectRoot: string, mode: ProjectMode, language: string, relativePath: string) =>
    ipcRenderer.invoke("document:load", { projectRoot, mode, language, relativePath }),
  saveTranslations: (payload: SaveTranslationsPayload) =>
    ipcRenderer.invoke("document:saveTranslations", payload),
  rebuildDocument: (payload: RebuildPayload) => ipcRenderer.invoke("document:rebuild", payload),
  onOpenProjectRequest: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("project:openRequest", listener);
    return () => {
      ipcRenderer.removeListener("project:openRequest", listener);
    };
  },
  onOpenConfigRequest: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("config:openRequest", listener);
    return () => {
      ipcRenderer.removeListener("config:openRequest", listener);
    };
  }
};

contextBridge.exposeInMainWorld("i18nToolkit", api);

export type I18nToolkitApi = typeof api;
