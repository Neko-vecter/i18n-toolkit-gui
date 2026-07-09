import React, { useMemo, useRef, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Hash,
  Languages,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  Save,
  Search,
  Settings,
  Upload
} from "lucide-react";
import type { DocFile, LoadedDocument, ProjectState, RebuildResult, TranslationBlock } from "../shared/types";
import "./styles.css";

type StatusKind = "idle" | "loading" | "saving" | "rebuilding" | "error" | "success";

interface StatusState {
  kind: StatusKind;
  message: string;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  file?: DocFile;
}

const emptyStatus: StatusState = { kind: "idle", message: "Ready" };

type ThemeMode = "light" | "dark" | "system";

interface AppSettings {
  themeMode: ThemeMode;
  editorFontSize: number;
  editorLineHeight: number;
  wordWrap: boolean;
  syncScroll: boolean;
  minimap: boolean;
}

const defaultSettings: AppSettings = {
  themeMode: "system",
  editorFontSize: 13,
  editorLineHeight: 21,
  wordWrap: true,
  syncScroll: true,
  minimap: false
};

function loadSettings(): AppSettings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem("i18n-toolkit-settings") ?? "{}") };
  } catch {
    return defaultSettings;
  }
}

function normalizeTomlText(value: string) {
  return value.startsWith("\n") ? value.slice(1) : value;
}

function toTomlText(value: string, original: string) {
  return original.startsWith("\n") ? `\n${value}` : value;
}

function buildTree(files: DocFile[]) {
  const root: TreeNode = { name: "docs", path: "", children: new Map() };
  for (const file of files) {
    const parts = file.relativePath.split("/");
    let current = root;

    parts.forEach((part, index) => {
      const nodePath = parts.slice(0, index + 1).join("/");
      if (!current.children.has(part)) {
        current.children.set(part, { name: part, path: nodePath, children: new Map() });
      }
      current = current.children.get(part)!;
      if (index === parts.length - 1) {
        current.file = file;
      }
    });
  }
  return root;
}

function editorOptions(settings: AppSettings): Monaco.editor.IStandaloneEditorConstructionOptions {
  return {
  automaticLayout: true,
  fontFamily: '"Cascadia Code", "Fira Code", Consolas, monospace',
  fontSize: settings.editorFontSize,
  lineHeight: settings.editorLineHeight,
  lineNumbers: "on",
  minimap: { enabled: settings.minimap },
  renderLineHighlight: "line",
  scrollBeyondLastLine: false,
  scrollbar: {
    alwaysConsumeMouseWheel: false,
    horizontalScrollbarSize: 10,
    verticalScrollbarSize: 10
  },
  tabSize: 2,
  wordWrap: settings.wordWrap ? "on" : "off",
  wrappingIndent: "same"
  };
}

let monacoMdxConfigured = false;

function configureMonacoMdx(monacoInstance: typeof Monaco) {
  if (monacoMdxConfigured) {
    return;
  }

  monacoMdxConfigured = true;
  monacoInstance.languages.register({ id: "mdx", extensions: [".mdx", ".md"] });
  monacoInstance.languages.setLanguageConfiguration("mdx", {
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
      ["<", ">"]
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "<", close: ">" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "`", close: "`" }
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "<", close: ">" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: "`", close: "`" }
    ]
  });

  monacoInstance.languages.setMonarchTokensProvider("mdx", {
    defaultToken: "",
    tokenPostfix: ".mdx",
    tokenizer: {
      root: [
        [/^---\s*$/, "delimiter.frontmatter", "@frontmatter"],
        [/^```.*$/, "delimiter.code", "@codeblock"],
        [/^#{1,6}\s.+$/, "keyword.heading"],
        [/^>\s.+$/, "comment.quote"],
        [/^\s*[-*+]\s+/, "keyword.list"],
        [/^\s*\d+\.\s+/, "keyword.list"],
        [/^import\s+.*$/, "keyword.import"],
        [/^export\s+.*$/, "keyword.export"],
        [/\{\/\*/, "comment", "@jsxComment"],
        [/<!--/, "comment", "@htmlComment"],
        [/<\/?[A-Z][\w.]*/, "tag", "@jsxTag"],
        [/<\/?[a-z][\w-]*/, "tag", "@jsxTag"],
        [/`[^`]+`/, "string.inlineCode"],
        [/\*\*[^*]+\*\*/, "strong"],
        [/\*[^*]+\*/, "emphasis"],
        [/\[[^\]]+\]\([^)]+\)/, "string.link"],
        [/[{}]/, "delimiter.bracket"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/'([^'\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@doubleString"],
        [/'/, "string", "@singleString"]
      ],
      frontmatter: [
        [/^---\s*$/, "delimiter.frontmatter", "@pop"],
        [/^\w[\w-]*(?=\s*:)/, "attribute.name"],
        [/:\s*/, "delimiter"],
        [/.*$/, "string.yaml"]
      ],
      codeblock: [
        [/^```\s*$/, "delimiter.code", "@pop"],
        [/.*$/, "string.code"]
      ],
      jsxTag: [
        [/\s+[A-Za-z_$][\w$-]*(?=\=)/, "attribute.name"],
        [/\s+[A-Za-z_$][\w$-]*/, "attribute.name"],
        [/=/, "delimiter"],
        [/"([^"\\]|\\.)*"/, "attribute.value"],
        [/'([^'\\]|\\.)*'/, "attribute.value"],
        [/\{[^}]*\}/, "delimiter.bracket"],
        [/\/?>/, "tag", "@pop"]
      ],
      jsxComment: [
        [/\*\/\}/, "comment", "@pop"],
        [/./, "comment"]
      ],
      htmlComment: [
        [/-->/, "comment", "@pop"],
        [/./, "comment"]
      ],
      doubleString: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"]
      ],
      singleString: [
        [/[^\\']+/, "string"],
        [/\\./, "string.escape"],
        [/'/, "string", "@pop"]
      ]
    }
  });

  monacoInstance.editor.defineTheme("i18n-mdx", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword.heading", foreground: "009a9c", fontStyle: "bold" },
      { token: "keyword.list", foreground: "00aeb0" },
      { token: "keyword.import", foreground: "7a3f99" },
      { token: "keyword.export", foreground: "7a3f99" },
      { token: "tag", foreground: "116b5f" },
      { token: "attribute.name", foreground: "8a4b08" },
      { token: "attribute.value", foreground: "9a3412" },
      { token: "delimiter.bracket", foreground: "4b5563" },
      { token: "delimiter.code", foreground: "6b7280" },
      { token: "delimiter.frontmatter", foreground: "6b7280" },
      { token: "string", foreground: "9a3412" },
      { token: "string.inlineCode", foreground: "b42318" },
      { token: "string.link", foreground: "1d4ed8" },
      { token: "comment", foreground: "6a737d", fontStyle: "italic" },
      { token: "strong", fontStyle: "bold" },
      { token: "emphasis", fontStyle: "italic" }
    ],
    colors: {
      "editor.background": "#ffffff",
      "editorLineNumber.foreground": "#8a929b",
      "editorLineNumber.activeForeground": "#009a9c",
      "editorCursor.foreground": "#009a9c",
      "editor.selectionBackground": "#00c1c344",
      "editor.lineHighlightBackground": "#f3f7f822"
    }
  });

  monacoInstance.editor.defineTheme("i18n-mdx-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword.heading", foreground: "00fbfd", fontStyle: "bold" },
      { token: "keyword.list", foreground: "00dee0" },
      { token: "keyword.import", foreground: "c084fc" },
      { token: "keyword.export", foreground: "c084fc" },
      { token: "tag", foreground: "5eead4" },
      { token: "attribute.name", foreground: "fdba74" },
      { token: "attribute.value", foreground: "fca5a5" },
      { token: "delimiter.bracket", foreground: "cbd5e1" },
      { token: "delimiter.code", foreground: "94a3b8" },
      { token: "delimiter.frontmatter", foreground: "94a3b8" },
      { token: "string", foreground: "fca5a5" },
      { token: "string.inlineCode", foreground: "00d4d6" },
      { token: "string.link", foreground: "60a5fa" },
      { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
      { token: "strong", fontStyle: "bold" },
      { token: "emphasis", fontStyle: "italic" }
    ],
    colors: {
      "editor.background": "#0f1720",
      "editor.foreground": "#e5e7eb",
      "editorLineNumber.foreground": "#64748b",
      "editorLineNumber.activeForeground": "#00fbfd",
      "editorCursor.foreground": "#00fbfd",
      "editor.selectionBackground": "#00c1c355",
      "editor.lineHighlightBackground": "#1f293722"
    }
  });
}

function SyncedMdxEditors({
  origin,
  translate,
  onChange,
  disabled,
  settings,
  colorTheme
}: {
  origin: string;
  translate: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  settings: AppSettings;
  colorTheme: "light" | "dark";
}) {
  const originEditor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const translateEditor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const originCursorLineDecorations = useRef<string[]>([]);
  const syncing = useRef(false);

  const syncScroll = (
    source: Monaco.editor.IStandaloneCodeEditor,
    target: Monaco.editor.IStandaloneCodeEditor | null
  ) => {
    if (!settings.syncScroll || !target || syncing.current) {
      return;
    }

    syncing.current = true;
    target.setScrollTop(source.getScrollTop());
    window.setTimeout(() => {
      syncing.current = false;
    }, 0);
  };

  const mountOrigin: OnMount = (editor) => {
    originEditor.current = editor;
    editor.onDidScrollChange((event) => {
      if (event.scrollTopChanged) {
        syncScroll(editor, translateEditor.current);
      }
    });
  };

  const mountTranslate: OnMount = (editor, monacoInstance) => {
    translateEditor.current = editor;
    editor.onDidScrollChange((event) => {
      if (event.scrollTopChanged) {
        syncScroll(editor, originEditor.current);
      }
    });
    editor.onDidChangeCursorPosition((event) => {
      const target = originEditor.current;
      const model = target?.getModel();
      if (!target || !model) {
        return;
      }

      const lineNumber = Math.min(event.position.lineNumber, model.getLineCount());
      target.setPosition({ lineNumber, column: 1 });
      target.revealLineInCenterIfOutsideViewport(lineNumber);
      originCursorLineDecorations.current = target.deltaDecorations(originCursorLineDecorations.current, [
        {
          range: new monacoInstance.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: "synced-cursor-line"
          }
        }
      ]);
    });
  };

  return (
    <>
      <div className="monaco-cell origin-cell">
        <Editor
          height="100%"
          beforeMount={configureMonacoMdx}
          defaultLanguage="mdx"
          theme={colorTheme === "dark" ? "i18n-mdx-dark" : "i18n-mdx"}
          path="origin.mdx"
          value={origin}
          options={{ ...editorOptions(settings), readOnly: true, domReadOnly: true }}
          onMount={mountOrigin}
        />
      </div>
      <div className="monaco-cell">
        <Editor
          height="100%"
          beforeMount={configureMonacoMdx}
          defaultLanguage="mdx"
          theme={colorTheme === "dark" ? "i18n-mdx-dark" : "i18n-mdx"}
          path="translate.mdx"
          value={translate}
          options={{ ...editorOptions(settings), readOnly: disabled }}
          onMount={mountTranslate}
          onChange={(value) => onChange(value ?? "")}
        />
      </div>
    </>
  );
}

function ControlPanel({
  open,
  settings,
  onChange,
  onClose
}: {
  open: boolean;
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <aside className="control-panel" aria-label="Control panel">
      <header className="control-header">
        <div>
          <span>Control panel</span>
          <small>Editor and appearance</small>
        </div>
        <button className="icon-button" onClick={onClose} title="Close control panel">
          <ChevronRight size={17} />
        </button>
      </header>

      <section className="setting-group">
        <label>Theme</label>
        <div className="segmented">
          {(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              className={settings.themeMode === mode ? "active" : ""}
              onClick={() => update("themeMode", mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </section>

      <section className="setting-group">
        <label htmlFor="font-size">Font size</label>
        <div className="range-row">
          <input
            id="font-size"
            type="range"
            min="11"
            max="18"
            value={settings.editorFontSize}
            onChange={(event) => update("editorFontSize", Number(event.target.value))}
          />
          <span>{settings.editorFontSize}px</span>
        </div>
      </section>

      <section className="setting-group">
        <label htmlFor="line-height">Line height</label>
        <div className="range-row">
          <input
            id="line-height"
            type="range"
            min="17"
            max="30"
            value={settings.editorLineHeight}
            onChange={(event) => update("editorLineHeight", Number(event.target.value))}
          />
          <span>{settings.editorLineHeight}px</span>
        </div>
      </section>

      <section className="setting-group toggles">
        <label>
          <input
            type="checkbox"
            checked={settings.wordWrap}
            onChange={(event) => update("wordWrap", event.target.checked)}
          />
          Word wrap
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.syncScroll}
            onChange={(event) => update("syncScroll", event.target.checked)}
          />
          Sync vertical scroll
        </label>
        <label>
          <input
            type="checkbox"
            checked={settings.minimap}
            onChange={(event) => update("minimap", event.target.checked)}
          />
          Minimap
        </label>
      </section>
    </aside>
  );
}

function FileTree({
  files,
  selected,
  onSelect
}: {
  files: DocFile[];
  selected?: string;
  onSelect: (file: DocFile) => void;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [open, setOpen] = useState<Set<string>>(() => new Set([""]));

  useEffect(() => {
    if (!selected) {
      return;
    }
    const parts = selected.split("/");
    const expanded = new Set(open);
    for (let index = 0; index < parts.length - 1; index += 1) {
      expanded.add(parts.slice(0, index + 1).join("/"));
    }
    setOpen(expanded);
  }, [selected]);

  function renderNode(node: TreeNode, depth = 0) {
    const children = [...node.children.values()].sort((a, b) => {
      if (!!a.file !== !!b.file) {
        return a.file ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

    return children.map((child) => {
      const isFile = Boolean(child.file);
      const isOpen = open.has(child.path);
      const isSelected = child.file?.relativePath === selected;

      if (isFile && child.file) {
        return (
          <button
            key={child.path}
            className={`tree-row file-row ${isSelected ? "selected" : ""}`}
            style={{ paddingLeft: 10 + depth * 12 }}
            onClick={() => onSelect(child.file!)}
            title={child.file.relativePath}
          >
            <FileText size={15} />
            <span>{child.name}</span>
          </button>
        );
      }

      return (
        <div key={child.path}>
          <button
            className="tree-row folder-row"
            style={{ paddingLeft: 8 + depth * 12 }}
            onClick={() => {
              const next = new Set(open);
              if (isOpen) {
                next.delete(child.path);
              } else {
                next.add(child.path);
              }
              setOpen(next);
            }}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isOpen ? <FolderOpen size={15} /> : <Folder size={15} />}
            <span>{child.name}</span>
          </button>
          {isOpen ? renderNode(child, depth + 1) : null}
        </div>
      );
    });
  }

  return <div className="file-tree">{renderNode(tree)}</div>;
}

function ProjectPicker({
  onChoose,
  onOpenLast,
  lastProjectPath,
  status
}: {
  onChoose: () => void;
  onOpenLast: () => void;
  lastProjectPath: string | null;
  status: StatusState;
}) {
  return (
    <main className="picker">
      <section className="picker-panel">
        <div className="mark">
          <Languages size={32} />
        </div>
        <h1>i18n Toolkit</h1>
        <button className="primary-button" onClick={onChoose}>
          <Upload size={18} />
          Choose Docusaurus project
        </button>
        {lastProjectPath ? (
          <button className="secondary-button" onClick={onOpenLast} title={lastProjectPath}>
            Open recent project
          </button>
        ) : null}
        <div className="picker-hint">
          Select the Docusaurus root folder that contains <code>docs/</code>.
        </div>
        {status.kind === "error" ? <p className="error-text">{status.message}</p> : null}
      </section>
    </main>
  );
}

function App() {
  if (!window.i18nToolkit) {
    return (
      <main className="picker">
        <section className="picker-panel">
          <div className="mark">
            <AlertTriangle size={32} />
          </div>
          <h1>Electron API unavailable</h1>
          <p className="error-text">
            Preload did not load. Restart with <code>yarn dev</code> so Electron main and preload are rebuilt.
          </p>
        </section>
      </main>
    );
  }

  const [project, setProject] = useState<ProjectState | null>(null);
  const [language, setLanguage] = useState("");
  const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
  const [document, setDocument] = useState<LoadedDocument | null>(null);
  const [blocks, setBlocks] = useState<TranslationBlock[]>([]);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState("");
  const [lastProjectPath, setLastProjectPath] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState>(emptyStatus);
  const [lastLog, setLastLog] = useState("");
  const [showLog, setShowLog] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [controlPanelOpen, setControlPanelOpen] = useState(false);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );

  const filteredDocs = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!project || !needle) {
      return project?.docs ?? [];
    }
    return project.docs.filter((file) => file.relativePath.toLowerCase().includes(needle));
  }, [project, filter]);

  const progress = useMemo(() => {
    if (!blocks.length) {
      return 0;
    }
    return Math.round(((currentBlockIndex + 1) / blocks.length) * 100);
  }, [blocks.length, currentBlockIndex]);

  const currentBlock = blocks[currentBlockIndex];
  const blockPosition = blocks.length ? `${currentBlockIndex + 1} / ${blocks.length}` : "0 / 0";
  const canGoPrevious = currentBlockIndex > 0;
  const canGoNext = currentBlockIndex < blocks.length - 1;
  const colorTheme = settings.themeMode === "system" ? systemTheme : settings.themeMode;

  function jumpToBlock(value: string) {
    const nextIndex = Number.parseInt(value, 10) - 1;
    if (!Number.isFinite(nextIndex) || !blocks.length) {
      return;
    }
    setCurrentBlockIndex(Math.min(blocks.length - 1, Math.max(0, nextIndex)));
  }

  function updateSettings(nextSettings: AppSettings) {
    setSettings(nextSettings);
    localStorage.setItem("i18n-toolkit-settings", JSON.stringify(nextSettings));
  }

  async function chooseProject() {
    setStatus({ kind: "loading", message: "Opening project" });
    try {
      const next = (await window.i18nToolkit.chooseProject()) as ProjectState | null;
      if (!next) {
        setStatus(emptyStatus);
        return;
      }
      setProject(next);
      setLanguage(next.languages[0] ?? "en");
      setSelectedFile(null);
      setDocument(null);
      setBlocks([]);
      setCurrentBlockIndex(0);
      setDirty(false);
      setStatus({ kind: "success", message: "Project loaded" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function openLastProject() {
    if (!lastProjectPath) {
      return;
    }
    setStatus({ kind: "loading", message: "Opening recent project" });
    try {
      const next = (await window.i18nToolkit.openProject(lastProjectPath)) as ProjectState;
      setProject(next);
      setLanguage(next.languages[0] ?? "en");
      setSelectedFile(null);
      setDocument(null);
      setBlocks([]);
      setCurrentBlockIndex(0);
      setDirty(false);
      setStatus({ kind: "success", message: "Project loaded" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function loadSelected(file: DocFile, lang = language) {
    if (!project || !lang) {
      return;
    }
    setSelectedFile(file);
    setStatus({ kind: "loading", message: "Loading document" });
    try {
      const loaded = (await window.i18nToolkit.loadDocument(project.rootPath, lang, file.relativePath)) as LoadedDocument;
      setDocument(loaded);
      setBlocks(loaded.blocks);
      setCurrentBlockIndex(0);
      setDirty(false);
      setStatus({
        kind: loaded.tomlExists ? "success" : "error",
        message: loaded.tomlExists ? "Document loaded" : "TOML missing. Run rebuild."
      });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function save(advanceAfterSave = false) {
    if (!project || !selectedFile || !document) {
      return;
    }
    setStatus({ kind: "saving", message: "Saving translations" });
    try {
      const saved = (await window.i18nToolkit.saveTranslations({
        projectRoot: project.rootPath,
        language,
        relativePath: selectedFile.relativePath,
        blocks
      })) as LoadedDocument;
      setDocument(saved);
      setBlocks(saved.blocks);
      setDirty(false);
      if (advanceAfterSave && currentBlockIndex < saved.blocks.length - 1) {
        setCurrentBlockIndex((index) => index + 1);
      }
      setStatus({ kind: "success", message: "Saved" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function rebuild() {
    if (!project || !selectedFile) {
      return;
    }
    setStatus({ kind: "rebuilding", message: "Rebuilding current file" });
    setLastLog("");
    setShowLog(false);
    try {
      const result = (await window.i18nToolkit.rebuildDocument({
        projectRoot: project.rootPath,
        language,
        relativePath: selectedFile.relativePath
      })) as RebuildResult;
      setLastLog(result.output || "");
      if (!result.ok) {
        setShowLog(true);
        setStatus({ kind: "error", message: "Rebuild failed. Open the log for full output." });
        return;
      }
      await loadSelected(selectedFile);
      setStatus({ kind: "success", message: "Rebuilt" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastLog(message);
      setShowLog(true);
      setStatus({ kind: "error", message: "Rebuild failed. Open the log for full output." });
    }
  }

  useEffect(() => {
    window.i18nToolkit
      .getLastProjectPath()
      .then((path: string | null) => setLastProjectPath(path))
      .catch(() => setLastProjectPath(null));

    window.i18nToolkit
      .getInitialProject()
      .then((initial: ProjectState | null) => {
        if (!initial) {
          return;
        }
        setProject(initial);
        setLanguage(initial.languages[0] ?? "en");
      })
      .catch((error: unknown) => {
        setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
      });

    return window.i18nToolkit.onOpenProjectRequest(() => {
      void chooseProject();
    });
  }, []);

  useEffect(() => {
    return window.i18nToolkit.onOpenConfigRequest(() => {
      setControlPanelOpen(true);
    });
  }, []);

  useEffect(() => {
    globalThis.document.documentElement.dataset.theme = colorTheme;
  }, [colorTheme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMedia = () => setSystemTheme(media.matches ? "dark" : "light");
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        setControlPanelOpen((open) => !open);
      }
      if (event.key === "Escape") {
        setControlPanelOpen(false);
      }
    };

    media.addEventListener("change", handleMedia);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      media.removeEventListener("change", handleMedia);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (selectedFile && language) {
      void loadSelected(selectedFile, language);
    }
  }, [language]);

  if (!project) {
    return (
      <ProjectPicker
        onChoose={chooseProject}
        onOpenLast={openLastProject}
        lastProjectPath={lastProjectPath}
        status={status}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div>
            <div className="project-label">Project</div>
            <div className="project-path" title={project.rootPath}>
              {project.rootPath}
            </div>
            {project.validation.warnings.length ? (
              <div className="project-warning" title={project.validation.warnings.join("\n")}>
                <AlertTriangle size={13} />
                <span>{project.validation.warnings.length} project warning</span>
              </div>
            ) : null}
          </div>
          <button className="icon-button" onClick={chooseProject} title="Open project">
            <Upload size={17} />
          </button>
        </div>
        <label className="search-box">
          <Search size={15} />
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter docs" />
        </label>
        <FileTree files={filteredDocs} selected={selectedFile?.relativePath} onSelect={(file) => void loadSelected(file)} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="current-file">
            <span>{selectedFile?.relativePath ?? "No document selected"}</span>
            {dirty ? <small>Unsaved</small> : null}
          </div>
          <div className="toolbar">
            <button className="icon-button" onClick={() => setControlPanelOpen(true)} title="Control panel">
              <Settings size={17} />
            </button>
            <label className="language-select">
              <Languages size={16} />
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                {(project.languages.length ? project.languages : [language || "en"]).map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </label>
            <div className="progress" title={`Block progress ${blockPosition}`}>
              <div style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{progress}%</span>
            <label className="jump-control" title="Jump to block">
              <Hash size={15} />
              <input
                type="number"
                min="1"
                max={Math.max(1, blocks.length)}
                value={blocks.length ? currentBlockIndex + 1 : ""}
                disabled={!blocks.length || status.kind === "saving" || status.kind === "rebuilding"}
                onChange={(event) => jumpToBlock(event.target.value)}
              />
              <span>/ {blocks.length}</span>
            </label>
            <button
              className="toolbar-button"
              onClick={() => setCurrentBlockIndex((index) => Math.max(0, index - 1))}
              disabled={!canGoPrevious || status.kind === "saving" || status.kind === "rebuilding"}
              title="Previous key"
            >
              <ArrowLeft size={16} />
              Previous
            </button>
            <span className="block-counter">{blockPosition}</span>
            <button
              className="toolbar-button"
              onClick={() => setCurrentBlockIndex((index) => Math.min(blocks.length - 1, index + 1))}
              disabled={!canGoNext || status.kind === "saving" || status.kind === "rebuilding"}
              title="Next key"
            >
              Next
              <ArrowRight size={16} />
            </button>
            <button
              className="toolbar-button strong"
              onClick={() => void save(true)}
              disabled={!dirty || !document || status.kind === "saving"}
            >
              {status.kind === "saving" ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
              Save & Next
            </button>
            <button
              className="toolbar-button"
              onClick={rebuild}
              disabled={!selectedFile || status.kind === "rebuilding"}
            >
              {status.kind === "rebuilding" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Rebuild
            </button>
          </div>
        </header>

        <div className={`status-line ${status.kind}`}>
          {status.kind === "success" ? <Check size={15} /> : null}
          <span>{status.message}</span>
          {lastLog ? (
            <button className="log-toggle" onClick={() => setShowLog((visible) => !visible)}>
              {showLog ? "Hide log" : "View log"}
            </button>
          ) : null}
        </div>

        {showLog && lastLog ? (
          <section className="log-panel">
            <div className="log-header">
              <span>Rebuild log</span>
              <button className="log-toggle" onClick={() => setShowLog(false)}>
                Close
              </button>
            </div>
            <pre>{lastLog}</pre>
          </section>
        ) : null}

        {!selectedFile ? (
          <div className="empty-state">Select a document</div>
        ) : (
          <main className="translation-structure">
            <div className="structure-header">
              <div>Original</div>
              <div>Translation</div>
            </div>
            <div className="blocks">
              {currentBlock ? (
                <article className="block-pair single-block" key={currentBlock.key || currentBlockIndex}>
                  <div className="block-title">
                    <span>Block {currentBlockIndex + 1}</span>
                    <code>{currentBlock.key}</code>
                  </div>
                  <SyncedMdxEditors
                    origin={normalizeTomlText(currentBlock.origin)}
                    translate={normalizeTomlText(currentBlock.translate)}
                    disabled={status.kind === "saving" || status.kind === "rebuilding"}
                    settings={settings}
                    colorTheme={colorTheme}
                    onChange={(nextValue) => {
                      setBlocks((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === currentBlockIndex
                            ? { ...item, translate: toTomlText(nextValue, item.translate) }
                            : item
                        )
                      );
                      setDirty(true);
                    }}
                  />
                </article>
              ) : (
                <div className="empty-state">
                  {document?.tomlExists ? "No TOML blocks" : "No TOML file for this document. Run rebuild."}
                </div>
              )}
            </div>
          </main>
        )}
      </section>
      <ControlPanel
        open={controlPanelOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setControlPanelOpen(false)}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
