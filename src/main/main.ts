import { app, BrowserWindow, dialog, ipcMain, Menu, type OpenDialogOptions } from "electron";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import * as TOML from "@iarna/toml";
import type {
  DocFile,
  LoadedDocument,
  ProjectMode,
  ProjectState,
  ProjectValidation,
  RebuildPayload,
  RebuildResult,
  SaveTranslationsPayload,
  TranslationBlock
} from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const docsPluginPath = path.join("docusaurus-plugin-content-docs", "current");

if (process.env.I18N_TOOLKIT_DEV_USER_DATA) {
  app.setPath("userData", process.env.I18N_TOOLKIT_DEV_USER_DATA);
}

interface StoredConfig {
  lastProjectRoot?: string;
}

interface TomlDocument {
  metadata?: Record<string, unknown>;
  block?: Array<Record<string, unknown>>;
}

function configPath() {
  return path.join(app.getPath("userData"), "config.json");
}

async function readConfig(): Promise<StoredConfig> {
  try {
    return JSON.parse(await fs.readFile(configPath(), "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

async function writeConfig(config: StoredConfig) {
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
}

async function exists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizeRelative(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function tomlPathFor(projectRoot: string, language: string, relativePath: string, mode: ProjectMode) {
  if (mode === "separated-toml") {
    return path.join(projectRoot, language, relativePath);
  }

  const parsed = path.parse(relativePath);
  const tomlRelative = path.join(parsed.dir, `${parsed.name}.toml`);
  return path.join(projectRoot, "i18n", language, docsPluginPath, tomlRelative);
}

function docPathFor(projectRoot: string, relativePath: string) {
  return path.join(projectRoot, "docs", relativePath);
}

async function scanDocs(projectRoot: string): Promise<DocFile[]> {
  const docsRoot = path.join(projectRoot, "docs");
  const files: DocFile[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      const extension = path.extname(entry.name);
      if (extension !== ".md" && extension !== ".mdx") {
        continue;
      }

      files.push({
        name: entry.name,
        relativePath: normalizeRelative(path.relative(docsRoot, absolutePath)),
        absolutePath,
        extension
      });
    }
  }

  if (await exists(docsRoot)) {
    await walk(docsRoot);
  }

  return files;
}

async function scanSeparatedTomlFiles(projectRoot: string, language: string): Promise<DocFile[]> {
  const languageRoot = path.join(projectRoot, language);
  const files: DocFile[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (path.extname(entry.name) !== ".toml") {
        continue;
      }

      files.push({
        name: entry.name,
        relativePath: normalizeRelative(path.relative(languageRoot, absolutePath)),
        absolutePath,
        extension: ".toml"
      });
    }
  }

  if (await exists(languageRoot)) {
    await walk(languageRoot);
  }

  return files;
}

async function scanDocusaurusLanguages(projectRoot: string): Promise<string[]> {
  const i18nRoot = path.join(projectRoot, "i18n");
  if (!(await exists(i18nRoot))) {
    return [];
  }

  const entries = await fs.readdir(i18nRoot, { withFileTypes: true });
  const languages: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const contentRoot = path.join(i18nRoot, entry.name, docsPluginPath);
    if (await exists(contentRoot)) {
      languages.push(entry.name);
    }
  }

  return languages.sort((a, b) => a.localeCompare(b));
}

async function scanSeparatedLanguages(projectRoot: string): Promise<string[]> {
  const entries = await fs.readdir(projectRoot, { withFileTypes: true });
  const languages: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if ((await scanSeparatedTomlFiles(projectRoot, entry.name)).length) {
      languages.push(entry.name);
    }
  }

  return languages.sort((a, b) => a.localeCompare(b));
}

async function detectProjectMode(projectRoot: string): Promise<ProjectMode | null> {
  if (await exists(path.join(projectRoot, "i18n-project.toml"))) {
    return "separated-toml";
  }

  if (await exists(path.join(projectRoot, "docs"))) {
    return "docusaurus";
  }

  return null;
}

async function validateProject(projectRoot: string, mode: ProjectMode | null): Promise<ProjectValidation> {
  const hasProjectToml = await exists(path.join(projectRoot, "i18n-project.toml"));
  const hasDocs = await exists(path.join(projectRoot, "docs"));
  const hasPackageJson = await exists(path.join(projectRoot, "package.json"));
  const hasI18n = await exists(path.join(projectRoot, "i18n"));
  const configCandidates = [
    "docusaurus.config.js",
    "docusaurus.config.mjs",
    "docusaurus.config.cjs",
    "docusaurus.config.ts"
  ];
  const configChecks = await Promise.all(
    configCandidates.map((configName) => exists(path.join(projectRoot, configName)))
  );
  const hasDocusaurusConfig = configChecks.some(Boolean);
  const warnings: string[] = [];

  if (mode === "docusaurus" && !hasDocusaurusConfig) {
    warnings.push("No docusaurus.config.* file found.");
  }
  if (mode === "docusaurus" && !hasPackageJson) {
    warnings.push("No package.json found.");
  }
  if (mode === "docusaurus" && !hasI18n) {
    warnings.push("No i18n/ folder found yet. Languages will default to en.");
  }
  if (mode === "separated-toml" && !hasProjectToml) {
    warnings.push("No i18n-project.toml marker found.");
  }

  return {
    hasProjectToml,
    hasDocs,
    hasDocusaurusConfig,
    hasPackageJson,
    hasI18n,
    warnings
  };
}

async function openProject(projectRoot: string): Promise<ProjectState> {
  const mode = await detectProjectMode(projectRoot);
  const validation = await validateProject(projectRoot, mode);
  if (!mode) {
    throw new Error(`Invalid project folder: ${projectRoot} must contain docs/ or i18n-project.toml.`);
  }

  const languages = mode === "separated-toml" ? await scanSeparatedLanguages(projectRoot) : await scanDocusaurusLanguages(projectRoot);
  const files =
    mode === "separated-toml"
      ? languages[0]
        ? await scanSeparatedTomlFiles(projectRoot, languages[0])
        : []
      : await scanDocs(projectRoot);

  const state: ProjectState = {
    rootPath: projectRoot,
    mode,
    docs: files,
    languages,
    validation
  };

  await writeConfig({ lastProjectRoot: projectRoot });
  return state;
}

function parseTomlBlocks(rawToml: string): TranslationBlock[] {
  const parsed = TOML.parse(rawToml) as TomlDocument;
  const blocks = Array.isArray(parsed.block) ? parsed.block : [];

  return blocks.map((block) => ({
    key: String(block.key ?? ""),
    origin: String(block.origin ?? ""),
    translate: String(block.translate ?? "")
  }));
}

function tomlMultiline(value: string) {
  const normalized = value.replace(/\r\n/g, "\n");
  const escaped = normalized.replace(/'''/g, "''\\'");
  return `'''\n${escaped.endsWith("\n") ? escaped : `${escaped}\n`}'''`;
}

function serializeTranslationToml(blocks: TranslationBlock[]) {
  const lines = ["[metadata]", ""];

  for (const block of blocks) {
    lines.push("[[block]]");
    lines.push(`key = ${JSON.stringify(block.key)}`);
    lines.push(`origin = ${tomlMultiline(block.origin)}`);
    lines.push(`translate = ${tomlMultiline(block.translate)}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function loadDocument(
  projectRoot: string,
  language: string,
  relativePath: string,
  mode: ProjectMode = "docusaurus"
): Promise<LoadedDocument> {
  let resolvedMode = mode;
  let resolvedLanguage = language;
  let resolvedRelativePath = relativePath;

  if ((language === "docusaurus" || language === "separated-toml") && relativePath) {
    resolvedMode = language;
    resolvedLanguage = relativePath;
    resolvedRelativePath = "";
  }

  if (!resolvedRelativePath) {
    throw new Error("Cannot load document without a file path.");
  }

  const tomlPath = tomlPathFor(projectRoot, resolvedLanguage, resolvedRelativePath, resolvedMode);
  const [original, tomlExists] = await Promise.all([
    resolvedMode === "docusaurus" ? fs.readFile(docPathFor(projectRoot, resolvedRelativePath), "utf8") : Promise.resolve(""),
    exists(tomlPath)
  ]);

  const blocks = tomlExists ? parseTomlBlocks(await fs.readFile(tomlPath, "utf8")) : [];

  return {
    projectRoot,
    language: resolvedLanguage,
    relativePath: resolvedRelativePath,
    original,
    tomlPath,
    tomlExists,
    blocks
  };
}

async function saveTranslations(payload: SaveTranslationsPayload): Promise<LoadedDocument> {
  const mode = payload.mode ?? "docusaurus";
  const tomlPath = tomlPathFor(payload.projectRoot, payload.language, payload.relativePath, mode);
  if (!(await exists(tomlPath))) {
    throw new Error(`Cannot save translations because TOML does not exist: ${tomlPath}`);
  }

  const parsed = TOML.parse(await fs.readFile(tomlPath, "utf8")) as TomlDocument;
  const translationByKey = new Map(payload.blocks.map((block) => [block.key, block.translate]));
  const blocks = Array.isArray(parsed.block) ? parsed.block : [];

  const nextBlocks = blocks.map((block) => {
    const key = String(block.key ?? "");
    return {
      key,
      origin: String(block.origin ?? ""),
      translate: translationByKey.has(key) ? (translationByKey.get(key) ?? "") : String(block.translate ?? "")
    };
  });

  await fs.writeFile(tomlPath, serializeTranslationToml(nextBlocks), "utf8");
  return loadDocument(payload.projectRoot, payload.language, payload.relativePath, mode);
}

function toolkitPath() {
  const candidates = [
    path.join(process.resourcesPath, "i18n-toolkit-python"),
    path.join(process.cwd(), "i18n-toolkit-python"),
    path.join(app.getAppPath(), "i18n-toolkit-python")
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function bundledPythonPath() {
  const executable = process.platform === "win32" ? "python.exe" : "python";
  const candidates = [
    path.join(process.resourcesPath, "python-runtime", executable),
    path.join(process.cwd(), "build", "python-runtime", executable)
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function runProcess(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<RebuildResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false, env: env ? { ...process.env, ...env } : process.env });
    const output: string[] = [];

    child.stdout.on("data", (chunk) => output.push(chunk.toString()));
    child.stderr.on("data", (chunk) => output.push(chunk.toString()));
    child.on("error", (error) => {
      resolve({ ok: false, output: `${command} failed to start: ${error.message}` });
    });
    child.on("close", (code) => {
      resolve({ ok: code === 0, output: output.join("").trim() });
    });
  });
}

function bundledPythonScriptArgs(scriptPath: string, toolkitRoot: string, scriptArgs: string[]) {
  const runner = [
    "import os, runpy, sys",
    "script = sys.argv[1]",
    "toolkit = sys.argv[2]",
    "sys.path.insert(0, toolkit)",
    "sys.argv = [script, *sys.argv[3:]]",
    "runpy.run_path(script, run_name='__main__')"
  ].join("; ");

  return ["-c", runner, scriptPath, toolkitRoot, ...scriptArgs];
}

async function runPythonScript(
  scriptName: string,
  projectRoot: string,
  relativePath: string,
  language: string
): Promise<RebuildResult> {
  const toolkitRoot = toolkitPath();
  const scriptPath = path.join(toolkitRoot, scriptName);
  const docPath = path.join("docs", relativePath);
  const scriptArgs = ["--input", docPath, "--lang", language];
  const bundledPython = bundledPythonPath();
  const candidates = bundledPython
    ? [{ command: bundledPython, args: bundledPythonScriptArgs(scriptPath, toolkitRoot, scriptArgs) }]
    :
    process.platform === "win32"
      ? [
          { command: "py", args: ["-3", scriptPath, ...scriptArgs] },
          { command: "python", args: [scriptPath, ...scriptArgs] }
        ]
      : [
          { command: "python3", args: [scriptPath, ...scriptArgs] },
          { command: "python", args: [scriptPath, ...scriptArgs] }
        ];

  let lastResult: RebuildResult = { ok: false, output: "" };
  for (const candidate of candidates) {
    lastResult = await runProcess(candidate.command, candidate.args, projectRoot);
    if (lastResult.ok || !lastResult.output.includes("failed to start")) {
      return lastResult;
    }
  }
  return lastResult;
}

async function rebuildDocument(payload: RebuildPayload): Promise<RebuildResult> {
  if (payload.mode === "separated-toml") {
    return { ok: false, output: "Rebuild is unavailable in separated TOML mode." };
  }

  const middleware = await runPythonScript(
    "build_file_middleware.py",
    payload.projectRoot,
    payload.relativePath,
    payload.language
  );
  if (!middleware.ok) {
    return {
      ok: false,
      output: `Middleware rebuild failed.\n\n${middleware.output}`
    };
  }

  const i18n = await runPythonScript(
    "build_file_i18n.py",
    payload.projectRoot,
    payload.relativePath,
    payload.language
  );

  return {
    ok: i18n.ok,
    output: [`Middleware rebuild complete.`, middleware.output, `i18n rebuild ${i18n.ok ? "complete" : "failed"}.`, i18n.output]
      .filter(Boolean)
      .join("\n\n")
  };
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 720,
    title: "i18n Toolkit",
    backgroundColor: "#f6f3ee",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await win.loadURL(devServerUrl);
  } else {
    await win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  ipcMain.handle("project:getInitial", async () => {
    const config = await readConfig();
    if (!config.lastProjectRoot || !(await detectProjectMode(config.lastProjectRoot))) {
      return null;
    }
    return openProject(config.lastProjectRoot);
  });

  ipcMain.handle("project:getLastPath", async () => {
    const config = await readConfig();
    if (!config.lastProjectRoot || !(await exists(config.lastProjectRoot))) {
      return null;
    }
    return config.lastProjectRoot;
  });

  ipcMain.handle("project:choose", async (event) => {
    const config = await readConfig();
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: "Choose i18n project folder",
      defaultPath: config.lastProjectRoot,
      properties: ["openDirectory"]
    };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return openProject(result.filePaths[0]);
  });

  ipcMain.handle("project:open", (_event, rootPath: string) => openProject(rootPath));
  ipcMain.handle("project:scanFiles", (_event, payload) =>
    payload.mode === "separated-toml"
      ? scanSeparatedTomlFiles(payload.projectRoot, payload.language)
      : scanDocs(payload.projectRoot)
  );
  ipcMain.handle("document:load", (_event, payload) =>
    loadDocument(payload.projectRoot, payload.language, payload.relativePath, payload.mode)
  );
  ipcMain.handle("document:saveTranslations", (_event, payload: SaveTranslationsPayload) =>
    saveTranslations(payload)
  );
  ipcMain.handle("document:rebuild", (_event, payload: RebuildPayload) => rebuildDocument(payload));

  await createWindow();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "File",
        submenu: [
          {
            label: "Open Project...",
            accelerator: "CmdOrCtrl+O",
            click: () => {
              BrowserWindow.getFocusedWindow()?.webContents.send("project:openRequest");
            }
          },
          {
            label: "Config",
            accelerator: "CmdOrCtrl+,",
            click: () => {
              BrowserWindow.getFocusedWindow()?.webContents.send("config:openRequest");
            }
          },
          { type: "separator" },
          { role: process.platform === "darwin" ? "close" : "quit" }
        ]
      },
      {
        label: "View",
        submenu: [{ role: "reload" }, { role: "toggleDevTools" }]
      }
    ])
  );

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
