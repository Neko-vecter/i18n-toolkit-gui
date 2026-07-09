import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Languages,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Upload
} from "lucide-react";
import Prism from "prismjs";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/themes/prism.css";
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

function highlightedMdx(value: string) {
  const grammar = Prism.languages.tsx || Prism.languages.jsx || Prism.languages.markdown;
  return Prism.highlight(value || " ", grammar, "tsx");
}

function MdxEditor({
  value,
  onChange,
  disabled
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mdx-editor">
      <pre className="mdx-highlight" aria-hidden="true">
        <code dangerouslySetInnerHTML={{ __html: highlightedMdx(value) }} />
      </pre>
      <textarea
        className="mdx-input"
        value={value}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
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
            style={{ paddingLeft: 14 + depth * 16 }}
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
            style={{ paddingLeft: 12 + depth * 16 }}
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

function ProjectPicker({ onChoose, status }: { onChoose: () => void; status: StatusState }) {
  return (
    <main className="picker">
      <section className="picker-panel">
        <div className="mark">
          <Languages size={32} />
        </div>
        <h1>i18n Toolkit</h1>
        <button className="primary-button" onClick={onChoose}>
          <Upload size={18} />
          Open project
        </button>
        {status.kind === "error" ? <p className="error-text">{status.message}</p> : null}
      </section>
    </main>
  );
}

function App() {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [language, setLanguage] = useState("");
  const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
  const [document, setDocument] = useState<LoadedDocument | null>(null);
  const [blocks, setBlocks] = useState<TranslationBlock[]>([]);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState<StatusState>(emptyStatus);

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
    const completed = blocks.filter((block) => normalizeTomlText(block.translate).trim()).length;
    return Math.round((completed / blocks.length) * 100);
  }, [blocks]);

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
      setDirty(false);
      setStatus({
        kind: loaded.tomlExists ? "success" : "error",
        message: loaded.tomlExists ? "Document loaded" : "TOML missing. Run rebuild."
      });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function save() {
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
    try {
      const result = (await window.i18nToolkit.rebuildDocument({
        projectRoot: project.rootPath,
        language,
        relativePath: selectedFile.relativePath
      })) as RebuildResult;
      if (!result.ok) {
        setStatus({ kind: "error", message: result.output || "Rebuild failed" });
        return;
      }
      await loadSelected(selectedFile);
      setStatus({ kind: "success", message: result.output || "Rebuilt" });
    } catch (error) {
      setStatus({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (selectedFile && language) {
      void loadSelected(selectedFile, language);
    }
  }, [language]);

  if (!project) {
    return <ProjectPicker onChoose={chooseProject} status={status} />;
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
            <div className="progress" title={`${progress}%`}>
              <div style={{ width: `${progress}%` }} />
            </div>
            <span className="progress-text">{progress}%</span>
            <button className="toolbar-button" onClick={save} disabled={!dirty || !document || status.kind === "saving"}>
              {status.kind === "saving" ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
              Save
            </button>
            <button
              className="toolbar-button strong"
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
        </div>

        {!selectedFile ? (
          <div className="empty-state">Select a document</div>
        ) : (
          <main className="editor-grid">
            <section className="pane">
              <div className="pane-header">Original</div>
              <pre className="original-view">
                <code dangerouslySetInnerHTML={{ __html: highlightedMdx(document?.original ?? "") }} />
              </pre>
            </section>
            <section className="pane">
              <div className="pane-header">Translation</div>
              <div className="blocks">
                {blocks.length ? (
                  blocks.map((block, index) => {
                    const value = normalizeTomlText(block.translate);
                    return (
                      <article className="block" key={block.key || index}>
                        <div className="block-title">
                          <span>Block {index + 1}</span>
                          <code>{block.key}</code>
                        </div>
                        <MdxEditor
                          value={value}
                          disabled={status.kind === "saving" || status.kind === "rebuilding"}
                          onChange={(nextValue) => {
                            setBlocks((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, translate: toTomlText(nextValue, item.translate) }
                                  : item
                              )
                            );
                            setDirty(true);
                          }}
                        />
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-state">No TOML blocks</div>
                )}
              </div>
            </section>
          </main>
        )}
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
