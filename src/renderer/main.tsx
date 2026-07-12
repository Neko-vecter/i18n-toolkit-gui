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
    Minus,
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    RefreshCw,
    Save,
    Search,
    Settings,
    Square,
    X,
    Upload,
} from "lucide-react";
import type {
    DocFile,
    LoadedDocument,
    ProjectState,
    RebuildResult,
    TranslationBlock,
} from "../shared/types";
import { ControlPanel, type AppSettings } from "../components/setting";
import { ProjectMenu } from "../components/menus";
import { ProjectPicker } from "../components/project-picker";
import "./styles.css";

type StatusKind =
    | "idle"
    | "loading"
    | "saving"
    | "rebuilding"
    | "error"
    | "success";
type DocumentView = "list" | "detail";

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

const defaultSettings: AppSettings = {
    themeMode: "system",
    editorFontSize: 13,
    editorLineHeight: 21,
    tabSize: 4,
    wordWrap: true,
    syncScroll: true,
    minimap: false,
    qwenApiKey: "",
    qwenBaseUrl: "",
};

function loadSettings(): AppSettings {
    try {
        const stored = JSON.parse(
            localStorage.getItem("i18n-toolkit-settings") ?? "{}",
        );
        return { ...defaultSettings, ...stored };
    } catch {
        return defaultSettings;
    }
}

function normalizeTomlText(value: string) {
    return value.startsWith("\n") ? value.slice(1) : value;
}

function lineCount(value: string) {
    return value.split(/\r\n|\r|\n/).length;
}

function hasMatchingLineCount(origin: string, translate: string) {
    return (
        lineCount(normalizeTomlText(origin)) ===
        lineCount(normalizeTomlText(translate))
    );
}

function toTomlText(value: string, original: string) {
    return original.startsWith("\n") ? `\n${value}` : value;
}

function previewText(value: string) {
    const normalized = normalizeTomlText(value).replace(/\s+/g, " ").trim();
    return normalized || "Empty";
}

function filenameFromPath(value?: string) {
    if (!value) {
        return "No document selected";
    }
    return value.split(/[\\/]/).pop() || value;
}

function folderNameFromPath(value: string) {
    const normalized = value.replace(/[\\/]+$/, "");
    return normalized.split(/[\\/]/).pop() || normalized;
}

function buildTree(files: DocFile[]) {
    const root: TreeNode = { name: "docs", path: "", children: new Map() };
    for (const file of files) {
        const parts = file.relativePath.split("/");
        let current = root;

        parts.forEach((part, index) => {
            const nodePath = parts.slice(0, index + 1).join("/");
            if (!current.children.has(part)) {
                current.children.set(part, {
                    name: part,
                    path: nodePath,
                    children: new Map(),
                });
            }
            current = current.children.get(part)!;
            if (index === parts.length - 1) {
                current.file = file;
            }
        });
    }
    return root;
}

function editorOptions(
    settings: AppSettings,
): Monaco.editor.IStandaloneEditorConstructionOptions {
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
            verticalScrollbarSize: 10,
        },
        detectIndentation: false,
        insertSpaces: true,
        tabSize: settings.tabSize,
        wordWrap: settings.wordWrap ? "on" : "off",
        wrappingIndent: "same",
    };
}

let monacoMdxConfigured = false;

function configureMonacoMdx(monacoInstance: typeof Monaco) {
    if (monacoMdxConfigured) {
        return;
    }

    monacoMdxConfigured = true;
    monacoInstance.languages.register({
        id: "mdx",
        extensions: [".mdx", ".md"],
    });
    monacoInstance.languages.setLanguageConfiguration("mdx", {
        comments: {
            blockComment: ["{/*", "*/}"],
        },
        brackets: [
            ["{", "}"],
            ["[", "]"],
            ["(", ")"],
        ],
        autoClosingPairs: [
            { open: "{", close: "}" },
            { open: "[", close: "]" },
            { open: "(", close: ")" },
            { open: "<", close: ">", notIn: ["string"] },
            { open: '"', close: '"', notIn: ["string"] },
            { open: "'", close: "'", notIn: ["string"] },
            { open: "/*", close: "*/", notIn: ["string"] },
        ],
        surroundingPairs: [
            { open: "{", close: "}" },
            { open: "[", close: "]" },
            { open: "(", close: ")" },
            { open: "<", close: ">" },
            { open: '"', close: '"' },
            { open: "'", close: "'" },
            { open: "`", close: "`" },
            { open: "_", close: "_" },
            { open: "*", close: "*" },
        ],
    });

    monacoInstance.languages.setMonarchTokensProvider("mdx", {
        defaultToken: "",
        tokenPostfix: ".mdx",
        tokenizer: {
            root: [
                [/^---\s*$/, "delimiter.frontmatter", "@yamlFrontmatter"],
                [/^\+\+\+\s*$/, "delimiter.frontmatter", "@tomlFrontmatter"],
                [
                    /^(\s{0,3})(`{3,}|~{3,})(\s*[\w-]+)?(.*)$/,
                    [
                        "",
                        "delimiter.code",
                        "meta.code.info",
                        { token: "meta.code.attrs", next: "@codeblock" },
                    ],
                ],
                [/^(import|export)\b.*$/, "keyword.esm"],
                [/^\s{0,3}(#{1,6})(?=\s|$)/, "keyword.heading", "@heading"],
                [/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/, "delimiter.thematic"],
                [/^\s{0,3}>\s?/, "comment.quote"],
                [
                    /^\s{0,3}([-+*])(\s+\[[ xX]\])?/,
                    ["keyword.list", "keyword.task"],
                ],
                [
                    /^\s{0,3}(\d+\.)(\s+\[[ xX]\])?/,
                    ["keyword.list", "keyword.task"],
                ],
                [/^\s{0,3}\[[^\]]+\]:/, "string.link.definition"],
                [/^\s*\|.*\|\s*$/, "markup.table"],
                [/^(\s*)(:{3,})\s*$/, ["", "delimiter.admonition"]],
                [
                    /^(\s*)(:{3,})([A-Za-z][\w-]*)(\[)([^\]]*)(\])(\{[^}]*\})\s*$/,
                    [
                        "",
                        "delimiter.admonition",
                        "keyword.admonition",
                        "delimiter.admonition",
                        "string.admonition.title",
                        "delimiter.admonition",
                        "meta.admonition.attributes",
                    ],
                ],
                [
                    /^(\s*)(:{3,})([A-Za-z][\w-]*)(\[)([^\]]*)(\])\s*$/,
                    [
                        "",
                        "delimiter.admonition",
                        "keyword.admonition",
                        "delimiter.admonition",
                        "string.admonition.title",
                        "delimiter.admonition",
                    ],
                ],
                [
                    /^(\s*)(:{3,})([A-Za-z][\w-]*)(\{[^}]*\})\s*$/,
                    [
                        "",
                        "delimiter.admonition",
                        "keyword.admonition",
                        "meta.admonition.attributes",
                    ],
                ],
                [
                    /^(\s*)(:{3,})([A-Za-z][\w-]*)(\s+)(.+)$/,
                    [
                        "",
                        "delimiter.admonition",
                        "keyword.admonition",
                        "",
                        "string.admonition.title",
                    ],
                ],
                [
                    /^(\s*)(:{3,})([A-Za-z][\w-]*)\s*$/,
                    ["", "delimiter.admonition", "keyword.admonition"],
                ],
                [/\{\/\*/, "comment", "@jsxComment"],
                [/<!--/, "comment", "@htmlComment"],
                [/<\/?(?=[A-Za-z])/, "delimiter.jsx", "@jsxTag"],
                [/\{/, "delimiter.expression", "@mdxExpression"],
                { include: "@markdownInline" },
            ],
            yamlFrontmatter: [
                [/^---\s*$/, "delimiter.frontmatter", "@pop"],
                [/^\s*#.*$/, "comment.frontmatter"],
                [/^\w[\w-]*(?=\s*:)/, "attribute.name"],
                [/:\s*/, "delimiter"],
                [/.*$/, "string.yaml"],
            ],
            tomlFrontmatter: [
                [/^\+\+\+\s*$/, "delimiter.frontmatter", "@pop"],
                [/^\s*#.*$/, "comment.frontmatter"],
                [/^\s*\[[^\]]+\]/, "type.toml"],
                [/^\s*[\w.-]+(?=\s*=)/, "attribute.name"],
                [/=/, "delimiter"],
                [/.*$/, "string.toml"],
            ],
            codeblock: [
                [/^\s*(`{3,}|~{3,})\s*$/, "delimiter.code", "@pop"],
                [/.*$/, "string.code"],
            ],
            heading: [[/$/, "", "@pop"], { include: "@markdownInline" }],
            markdownInline: [
                [/\\[\\`*_[\]{}()#+\-.!|<>]/, "constant.escape"],
                [
                    /&(?:#\d+|#x[\da-fA-F]+|[a-zA-Z][\w.-]+);/,
                    "constant.character.reference",
                ],
                [/!\[[^\]]*\]\([^)]+\)/, "string.link.image"],
                [/\[[^\]]+\]\([^)]+\)/, "string.link"],
                [/\[[^\]]+\]\[[^\]]*\]/, "string.link.reference"],
                [/https?:\/\/[^\s<)]+/, "string.link.autolink"],
                [/@[A-Za-z0-9][\w-]*/, "constant.github.mention"],
                [/#\d+\b/, "constant.github.reference"],
                [/:[A-Za-z0-9_+-]+:/, "constant.gemoji"],
                [/`+[^`]*`+/, "string.inlineCode"],
                [/~~[^~]+~~/, "strikethrough"],
                [/\*\*[^*]+?\*\*/, "strong"],
                [/__[^_]+?__/, "strong"],
                [/\*[^*\s][^*]*\*/, "emphasis"],
                [/_[^_\s][^_]*_/, "emphasis"],
            ],
            mdxExpression: [
                [/\{\/\*/, "comment", "@jsxComment"],
                [/\/\*/, "comment", "@jsBlockComment"],
                [/\/\/.*$/, "comment"],
                [/\{/, "delimiter.expression", "@mdxExpression"],
                [/\}/, "delimiter.expression", "@pop"],
                [
                    /\b(?:await|break|case|catch|const|continue|default|do|else|finally|for|from|function|if|import|in|let|of|return|switch|throw|try|var|while|yield)\b/,
                    "keyword.js",
                ],
                [
                    /\b(?:true|false|null|undefined|NaN|Infinity)\b/,
                    "constant.language",
                ],
                [/\b[A-Z][\w$]*(?=\s*[({.])/, "support.class.component"],
                [/\b[\w$]+(?=\s*:)/, "attribute.name"],
                [/\d+(?:\.\d+)?/, "number"],
                [/"([^"\\]|\\.)*$/, "string.invalid"],
                [/'([^'\\]|\\.)*$/, "string.invalid"],
                [/`/, "string.template", "@templateString"],
                [/"/, "string", "@doubleString"],
                [/'/, "string", "@singleString"],
                [/[()[\].,?:;=+\-*/%&|!<>]+/, "delimiter"],
            ],
            jsxTag: [
                [/[A-Z][\w$]*(?:\.[A-Z][\w$]*)*/, "support.class.component"],
                [/[a-z][\w-]*/, "tag"],
                [/[A-Za-z_$][\w$-]*(?=\s*=)/, "attribute.name"],
                [/[A-Za-z_$][\w$-]*/, "attribute.name"],
                [/=/, "delimiter"],
                [/"([^"\\]|\\.)*"/, "attribute.value"],
                [/'([^'\\]|\\.)*'/, "attribute.value"],
                [/\{/, "delimiter.expression", "@mdxExpression"],
                [/\/?>/, "delimiter.jsx", "@pop"],
            ],
            jsxComment: [
                [/\*\/\}/, "comment", "@pop"],
                [/./, "comment"],
            ],
            jsBlockComment: [
                [/\*\//, "comment", "@pop"],
                [/./, "comment"],
            ],
            htmlComment: [
                [/-->/, "comment", "@pop"],
                [/./, "comment"],
            ],
            doubleString: [
                [/[^\\"]+/, "string"],
                [/\\./, "string.escape"],
                [/"/, "string", "@pop"],
            ],
            singleString: [
                [/[^\\']+/, "string"],
                [/\\./, "string.escape"],
                [/'/, "string", "@pop"],
            ],
            templateString: [
                [/[^\\`$]+/, "string.template"],
                [/\\./, "string.escape"],
                [/\$\{/, "delimiter.expression", "@mdxExpression"],
                [/`/, "string.template", "@pop"],
            ],
        },
    });

    monacoInstance.editor.defineTheme("i18n-mdx", {
        base: "vs",
        inherit: true,
        rules: [
            {
                token: "keyword.heading",
                foreground: "009a9c",
                fontStyle: "bold",
            },
            { token: "keyword.list", foreground: "00aeb0" },
            { token: "keyword.task", foreground: "009a9c" },
            { token: "keyword.import", foreground: "7a3f99" },
            { token: "keyword.export", foreground: "7a3f99" },
            { token: "keyword.esm", foreground: "7a3f99" },
            { token: "keyword.js", foreground: "7a3f99" },
            { token: "tag", foreground: "116b5f" },
            { token: "support.class.component", foreground: "0f766e" },
            { token: "attribute.name", foreground: "8a4b08" },
            { token: "attribute.value", foreground: "9a3412" },
            { token: "delimiter.bracket", foreground: "4b5563" },
            { token: "delimiter.jsx", foreground: "4b5563" },
            { token: "delimiter.expression", foreground: "009a9c" },
            { token: "delimiter.code", foreground: "6b7280" },
            { token: "delimiter.frontmatter", foreground: "6b7280" },
            { token: "delimiter.thematic", foreground: "6b7280" },
            {
                token: "delimiter.admonition",
                foreground: "7a3f99",
                fontStyle: "bold",
            },
            {
                token: "keyword.admonition",
                foreground: "b45309",
                fontStyle: "bold",
            },
            { token: "string.admonition.title", foreground: "0f766e" },
            { token: "meta.admonition.attributes", foreground: "6b7280" },
            {
                token: "meta.code.info",
                foreground: "0f766e",
                fontStyle: "bold",
            },
            { token: "meta.code.attrs", foreground: "6b7280" },
            { token: "markup.table", foreground: "2563eb" },
            { token: "type.toml", foreground: "0f766e", fontStyle: "bold" },
            { token: "string", foreground: "9a3412" },
            { token: "string.template", foreground: "9a3412" },
            { token: "string.inlineCode", foreground: "b42318" },
            { token: "string.link", foreground: "1d4ed8" },
            { token: "constant", foreground: "0f766e" },
            { token: "number", foreground: "0f766e" },
            { token: "comment", foreground: "6a737d", fontStyle: "italic" },
            { token: "strong", fontStyle: "bold" },
            { token: "emphasis", fontStyle: "italic" },
            { token: "strikethrough", fontStyle: "strikethrough" },
        ],
        colors: {
            "editor.background": "#ffffff",
            "editorLineNumber.foreground": "#8a929b",
            "editorLineNumber.activeForeground": "#009a9c",
            "editorCursor.foreground": "#009a9c",
            "editor.selectionBackground": "#00c1c344",
            "editor.lineHighlightBackground": "#f3f7f822",
        },
    });

    monacoInstance.editor.defineTheme("i18n-mdx-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
            {
                token: "keyword.heading",
                foreground: "00fbfd",
                fontStyle: "bold",
            },
            { token: "keyword.list", foreground: "00dee0" },
            { token: "keyword.task", foreground: "00fbfd" },
            { token: "keyword.import", foreground: "c084fc" },
            { token: "keyword.export", foreground: "c084fc" },
            { token: "keyword.esm", foreground: "c084fc" },
            { token: "keyword.js", foreground: "c084fc" },
            { token: "tag", foreground: "5eead4" },
            { token: "support.class.component", foreground: "2dd4bf" },
            { token: "attribute.name", foreground: "fdba74" },
            { token: "attribute.value", foreground: "fca5a5" },
            { token: "delimiter.bracket", foreground: "cbd5e1" },
            { token: "delimiter.jsx", foreground: "cbd5e1" },
            { token: "delimiter.expression", foreground: "00fbfd" },
            { token: "delimiter.code", foreground: "94a3b8" },
            { token: "delimiter.frontmatter", foreground: "94a3b8" },
            { token: "delimiter.thematic", foreground: "94a3b8" },
            {
                token: "delimiter.admonition",
                foreground: "c084fc",
                fontStyle: "bold",
            },
            {
                token: "keyword.admonition",
                foreground: "fdba74",
                fontStyle: "bold",
            },
            { token: "string.admonition.title", foreground: "5eead4" },
            { token: "meta.admonition.attributes", foreground: "94a3b8" },
            {
                token: "meta.code.info",
                foreground: "5eead4",
                fontStyle: "bold",
            },
            { token: "meta.code.attrs", foreground: "94a3b8" },
            { token: "markup.table", foreground: "93c5fd" },
            { token: "type.toml", foreground: "5eead4", fontStyle: "bold" },
            { token: "string", foreground: "fca5a5" },
            { token: "string.template", foreground: "fca5a5" },
            { token: "string.inlineCode", foreground: "00d4d6" },
            { token: "string.link", foreground: "60a5fa" },
            { token: "constant", foreground: "5eead4" },
            { token: "number", foreground: "5eead4" },
            { token: "comment", foreground: "94a3b8", fontStyle: "italic" },
            { token: "strong", fontStyle: "bold" },
            { token: "emphasis", fontStyle: "italic" },
            { token: "strikethrough", fontStyle: "strikethrough" },
        ],
        colors: {
            "editor.background": "#0f1720",
            "editor.foreground": "#e5e7eb",
            "editorLineNumber.foreground": "#64748b",
            "editorLineNumber.activeForeground": "#00fbfd",
            "editorCursor.foreground": "#00fbfd",
            "editor.selectionBackground": "#00c1c355",
            "editor.lineHighlightBackground": "#1f293722",
        },
    });
}

function SyncedMdxEditors({
    origin,
    translate,
    onChange,
    disabled,
    settings,
    colorTheme,
}: {
    origin: string;
    translate: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    settings: AppSettings;
    colorTheme: "light" | "dark";
}) {
    const originEditor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(
        null,
    );
    const translateEditor = useRef<Monaco.editor.IStandaloneCodeEditor | null>(
        null,
    );
    const originCursorLineDecorations = useRef<string[]>([]);
    const originAlignmentZones = useRef<string[]>([]);
    const translateAlignmentZones = useRef<string[]>([]);
    const alignmentFrame = useRef<number | null>(null);
    const alignmentUpdating = useRef(false);
    const settingsRef = useRef(settings);
    const syncing = useRef(false);

    settingsRef.current = settings;

    const clearAlignmentZones = (
        editor: Monaco.editor.IStandaloneCodeEditor | null,
        zones: React.MutableRefObject<string[]>,
    ) => {
        if (!editor || zones.current.length === 0) {
            return;
        }

        editor.changeViewZones((accessor) => {
            zones.current.forEach((zoneId) => accessor.removeZone(zoneId));
        });
        zones.current = [];
    };

    const alignWrappedLines = () => {
        const source = originEditor.current;
        const target = translateEditor.current;
        if (!source || !target) {
            return;
        }

        alignmentUpdating.current = true;
        clearAlignmentZones(source, originAlignmentZones);
        clearAlignmentZones(target, translateAlignmentZones);

        window.requestAnimationFrame(() => {
            const sourceModel = source.getModel();
            const targetModel = target.getModel();
            if (!sourceModel || !targetModel || !settingsRef.current.wordWrap) {
                alignmentUpdating.current = false;
                return;
            }

            const sharedLineCount = Math.min(
                sourceModel.getLineCount(),
                targetModel.getLineCount(),
            );
            const sourceZones: Array<{ lineNumber: number; height: number }> =
                [];
            const targetZones: Array<{ lineNumber: number; height: number }> =
                [];

            for (
                let lineNumber = 1;
                lineNumber < sharedLineCount;
                lineNumber += 1
            ) {
                const sourceHeight =
                    source.getTopForLineNumber(lineNumber + 1) -
                    source.getTopForLineNumber(lineNumber);
                const targetHeight =
                    target.getTopForLineNumber(lineNumber + 1) -
                    target.getTopForLineNumber(lineNumber);
                const heightDifference = sourceHeight - targetHeight;

                if (heightDifference > 0) {
                    targetZones.push({ lineNumber, height: heightDifference });
                } else if (heightDifference < 0) {
                    sourceZones.push({ lineNumber, height: -heightDifference });
                }
            }

            const addAlignmentZones = (
                editor: Monaco.editor.IStandaloneCodeEditor,
                zones: React.MutableRefObject<string[]>,
                additions: Array<{ lineNumber: number; height: number }>,
            ) => {
                editor.changeViewZones((accessor) => {
                    zones.current = additions.map(({ lineNumber, height }) => {
                        const spacer = document.createElement("div");
                        spacer.className = "line-alignment-spacer";
                        return accessor.addZone({
                            afterLineNumber: lineNumber,
                            heightInPx: height,
                            domNode: spacer,
                            suppressMouseDown: true,
                        });
                    });
                });
            };

            addAlignmentZones(source, originAlignmentZones, sourceZones);
            addAlignmentZones(target, translateAlignmentZones, targetZones);
            window.requestAnimationFrame(() => {
                alignmentUpdating.current = false;
            });
        });
    };

    const scheduleLineAlignment = () => {
        if (alignmentUpdating.current) {
            return;
        }
        if (alignmentFrame.current !== null) {
            window.cancelAnimationFrame(alignmentFrame.current);
        }
        alignmentFrame.current = window.requestAnimationFrame(() => {
            alignmentFrame.current = null;
            alignWrappedLines();
        });
    };

    useEffect(() => {
        scheduleLineAlignment();
    }, [
        origin,
        translate,
        settings.wordWrap,
        settings.editorFontSize,
        settings.editorLineHeight,
    ]);

    useEffect(() => {
        return () => {
            if (alignmentFrame.current !== null) {
                window.cancelAnimationFrame(alignmentFrame.current);
            }
        };
    }, []);

    const syncScroll = (
        source: Monaco.editor.IStandaloneCodeEditor,
        target: Monaco.editor.IStandaloneCodeEditor | null,
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
        editor.onDidChangeModelContent(scheduleLineAlignment);
        editor.onDidLayoutChange(scheduleLineAlignment);
        scheduleLineAlignment();
    };

    const mountTranslate: OnMount = (editor, monacoInstance) => {
        translateEditor.current = editor;
        editor.addAction({
            id: "i18n-toolkit.undo-translation",
            label: "Undo translation edit",
            keybindings: [
                monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyZ,
            ],
            run: () => editor.trigger("keyboard", "undo", null),
        });
        editor.onDidScrollChange((event) => {
            if (event.scrollTopChanged) {
                syncScroll(editor, originEditor.current);
            }
        });
        editor.onDidChangeModelContent(scheduleLineAlignment);
        editor.onDidLayoutChange(scheduleLineAlignment);
        editor.onDidChangeCursorPosition((event) => {
            const target = originEditor.current;
            const model = target?.getModel();
            if (!target || !model) {
                return;
            }

            const lineNumber = Math.min(
                event.position.lineNumber,
                model.getLineCount(),
            );
            target.revealLineInCenterIfOutsideViewport(lineNumber);
            originCursorLineDecorations.current = target.deltaDecorations(
                originCursorLineDecorations.current,
                [
                    {
                        range: new monacoInstance.Range(
                            lineNumber,
                            1,
                            lineNumber,
                            1,
                        ),
                        options: {
                            isWholeLine: true,
                            className: "synced-cursor-line",
                        },
                    },
                ],
            );
        });
        scheduleLineAlignment();
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
                    options={{
                        ...editorOptions(settings),
                        readOnly: true,
                        domReadOnly: true,
                    }}
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

function FileTree({
    files,
    selected,
    onSelect,
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
                        {isOpen ? (
                            <ChevronDown size={14} />
                        ) : (
                            <ChevronRight size={14} />
                        )}
                        {isOpen ? (
                            <FolderOpen size={15} />
                        ) : (
                            <Folder size={15} />
                        )}
                        <span>{child.name}</span>
                    </button>
                    {isOpen ? renderNode(child, depth + 1) : null}
                </div>
            );
        });
    }

    return <div className="file-tree">{renderNode(tree)}</div>;
}

function BlockTable({
    blocks,
    onOpenBlock,
}: {
    blocks: TranslationBlock[];
    onOpenBlock: (index: number) => void;
}) {
    if (!blocks.length) {
        return (
            <main className="block-list">
                <div className="empty-state">No TOML blocks</div>
            </main>
        );
    }

    return (
        <main className="block-list">
            <div
                className="block-table"
                role="table"
                aria-label="Translation blocks"
            >
                <div className="block-table-row block-table-head" role="row">
                    <div role="columnheader">key</div>
                    <div role="columnheader">origin</div>
                    <div role="columnheader">translate</div>
                </div>
                {blocks.map((block, index) => (
                    <div
                        className="block-table-row"
                        role="row"
                        key={block.key || index}
                    >
                        <button
                            type="button"
                            className="key-cell"
                            onClick={() => onOpenBlock(index)}
                            title={block.key}
                        >
                            {block.key}
                        </button>
                        <button
                            type="button"
                            onClick={() => onOpenBlock(index)}
                            title={normalizeTomlText(block.origin)}
                        >
                            {previewText(block.origin)}
                        </button>
                        <button
                            type="button"
                            onClick={() => onOpenBlock(index)}
                            title={normalizeTomlText(block.translate)}
                        >
                            {previewText(block.translate)}
                        </button>
                    </div>
                ))}
            </div>
        </main>
    );
}

function LanguageDropdown({
    value,
    languages,
    onChange,
}: {
    value: string;
    languages: string[];
    onChange: (language: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const options = languages.length ? languages : [value || "en"];
    const activeValue = value || options[0] || "en";

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        window.addEventListener("pointerdown", handlePointerDown);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [open]);

    return (
        <div className="language-select" ref={rootRef}>
            <button
                className="language-trigger"
                type="button"
                onClick={() => setOpen((visible) => !visible)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <Languages size={16} />
                <span>{activeValue}</span>
                <ChevronDown size={14} />
            </button>
            {open ? (
                <div
                    className="language-menu"
                    role="listbox"
                    aria-label="Working language"
                >
                    {options.map((lang) => (
                        <button
                            type="button"
                            role="option"
                            aria-selected={lang === activeValue}
                            className={lang === activeValue ? "active" : ""}
                            key={lang}
                            onClick={() => {
                                onChange(lang);
                                setOpen(false);
                            }}
                        >
                            {lang}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function WindowFrame({
    platform,
    title,
    subtitle,
    onChooseProject,
    onOpenRecent,
    onCloseProject,
    recentProjects,
    hasProject,
    onOpenConfig,
    children,
}: {
    platform: string;
    title: string;
    subtitle?: string;
    onChooseProject: () => void;
    onOpenRecent: (projectPath: string) => void;
    onCloseProject: () => void;
    recentProjects: string[];
    hasProject: boolean;
    onOpenConfig: () => void;
    children: React.ReactNode;
}) {
    const isMac = platform === "darwin";

    return (
        <div
            className={`window-shell ${isMac ? "platform-mac" : "platform-frameless"}`}
        >
            <header className="window-titlebar">
                <div className="titlebar-left">
                    <ProjectMenu
                        recentProjects={recentProjects}
                        hasProject={hasProject}
                        onChooseProject={onChooseProject}
                        onOpenRecent={onOpenRecent}
                        onCloseProject={onCloseProject}
                    />
                    <div className="window-title">
                        <span>{title}</span>
                        {subtitle ? <small>{subtitle}</small> : null}
                    </div>
                </div>
                <div className="titlebar-actions">
                    <button
                        className="titlebar-tool"
                        type="button"
                        onClick={onChooseProject}
                        title="Open project"
                    >
                        <Upload size={14} />
                    </button>
                    <button
                        className="titlebar-tool"
                        type="button"
                        onClick={onOpenConfig}
                        title="Config"
                    >
                        <Settings size={14} />
                    </button>
                    {!isMac ? (
                        <div
                            className="window-controls"
                            aria-label="Window controls"
                        >
                            <button
                                type="button"
                                onClick={() =>
                                    void window.i18nToolkit.windowMinimize()
                                }
                                title="Minimize"
                            >
                                <Minus size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    void window.i18nToolkit.windowMaximize()
                                }
                                title="Maximize"
                            >
                                <Square size={12} />
                            </button>
                            <button
                                className="close"
                                type="button"
                                onClick={() =>
                                    void window.i18nToolkit.windowClose()
                                }
                                title="Close"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    ) : null}
                </div>
            </header>
            {children}
        </div>
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
                        Preload did not load. Restart with <code>yarn dev</code>{" "}
                        so Electron main and preload are rebuilt.
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
    const [documentView, setDocumentView] = useState<DocumentView>("list");
    const [dirty, setDirty] = useState(false);
    const [filter, setFilter] = useState("");
    const [recentProjects, setRecentProjects] = useState<string[]>([]);
    const [status, setStatus] = useState<StatusState>(emptyStatus);
    const [lastLog, setLastLog] = useState("");
    const [showLog, setShowLog] = useState(false);
    const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
    const [controlPanelOpen, setControlPanelOpen] = useState(false);
    const shortcutBusy = useRef(false);
    const [systemTheme, setSystemTheme] = useState<"light" | "dark">(() =>
        window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light",
    );
    const platform = window.i18nToolkit.platform;

    const filteredDocs = useMemo(() => {
        const needle = filter.trim().toLowerCase();
        if (!project || !needle) {
            return project?.docs ?? [];
        }
        return project.docs.filter((file) =>
            file.relativePath.toLowerCase().includes(needle),
        );
    }, [project, filter]);

    const progress = useMemo(() => {
        if (!blocks.length) {
            return 0;
        }
        return Math.round(((currentBlockIndex + 1) / blocks.length) * 100);
    }, [blocks.length, currentBlockIndex]);

    const currentBlock = blocks[currentBlockIndex];
    const blockPosition = blocks.length
        ? `${currentBlockIndex + 1} / ${blocks.length}`
        : "0 / 0";
    const canGoPrevious = currentBlockIndex > 0;
    const canGoNext = currentBlockIndex < blocks.length - 1;
    const colorTheme =
        settings.themeMode === "system" ? systemTheme : settings.themeMode;
    const isSeparatedToml = project?.mode === "separated-toml";

    function jumpToBlock(value: string) {
        const nextIndex = Number.parseInt(value, 10) - 1;
        if (!Number.isFinite(nextIndex) || !blocks.length) {
            return;
        }
        setCurrentBlockIndex(
            Math.min(blocks.length - 1, Math.max(0, nextIndex)),
        );
        setDocumentView("detail");
    }

    function openBlock(index: number) {
        setCurrentBlockIndex(Math.min(blocks.length - 1, Math.max(0, index)));
        setDocumentView("detail");
    }

    function updateSettings(nextSettings: AppSettings) {
        setSettings(nextSettings);
        localStorage.setItem(
            "i18n-toolkit-settings",
            JSON.stringify(nextSettings),
        );
    }

    function clearDocumentState() {
        setSelectedFile(null);
        setDocument(null);
        setBlocks([]);
        setCurrentBlockIndex(0);
        setDocumentView("list");
        setDirty(false);
    }

    function applyProject(next: ProjectState) {
        setProject(next);
        setLanguage(next.languages[0] ?? "en");
        clearDocumentState();
        setLastLog("");
        setShowLog(false);
        setRecentProjects((projects) => [next.rootPath, ...projects.filter((path) => path !== next.rootPath)].slice(0, 10));
    }

    async function chooseProject() {
        setStatus({ kind: "loading", message: "Opening project" });
        try {
            const next =
                (await window.i18nToolkit.chooseProject()) as ProjectState | null;
            if (!next) {
                setStatus(emptyStatus);
                return;
            }
            applyProject(next);
            setStatus({ kind: "success", message: "Project loaded" });
        } catch (error) {
            setStatus({
                kind: "error",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    async function openRecentProject(projectPath: string) {
        setStatus({ kind: "loading", message: "Opening recent project" });
        try {
            const next = (await window.i18nToolkit.openProject(
                projectPath,
            )) as ProjectState;
            applyProject(next);
            setStatus({ kind: "success", message: "Project loaded" });
        } catch (error) {
            setStatus({
                kind: "error",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    function closeProject() {
        if ("closeProject" in window.i18nToolkit) {
            void window.i18nToolkit.closeProject();
        }
        setProject(null);
        clearDocumentState();
        setFilter("");
        setStatus(emptyStatus);
        setLastLog("");
        setShowLog(false);
        setControlPanelOpen(false);
    }

    async function loadSelected(file: DocFile, lang = language) {
        if (!project || !lang) {
            return;
        }
        setSelectedFile(file);
        setStatus({ kind: "loading", message: "Loading document" });
        try {
            const loaded = (await window.i18nToolkit.loadDocument(
                project.rootPath,
                project.mode,
                lang,
                file.relativePath,
            )) as LoadedDocument;
            setDocument(loaded);
            setBlocks(loaded.blocks);
            setCurrentBlockIndex(0);
            setDocumentView("list");
            setDirty(false);
            setStatus({
                kind: loaded.tomlExists ? "success" : "error",
                message: loaded.tomlExists
                    ? "Document loaded"
                    : project.mode === "separated-toml"
                      ? "TOML missing."
                      : "TOML missing. Run rebuild.",
            });
        } catch (error) {
            setStatus({
                kind: "error",
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }

    async function save(advanceAfterSave = false) {
        if (
            !project ||
            !selectedFile ||
            !document ||
            status.kind === "saving" ||
            status.kind === "rebuilding"
        ) {
            return false;
        }
        const mismatchedBlockIndex = blocks.findIndex(
            (block) => !hasMatchingLineCount(block.origin, block.translate),
        );
        if (mismatchedBlockIndex !== -1) {
            setCurrentBlockIndex(mismatchedBlockIndex);
            setDocumentView("detail");
            setStatus({
                kind: "error",
                message: `Block ${mismatchedBlockIndex + 1}: translation line count must match the original before saving.`,
            });
            return false;
        }
        setStatus({ kind: "saving", message: "Saving translations" });
        try {
            const saved = (await window.i18nToolkit.saveTranslations({
                projectRoot: project.rootPath,
                mode: project.mode,
                language,
                relativePath: selectedFile.relativePath,
                blocks,
            })) as LoadedDocument;
            setDocument(saved);
            setBlocks(saved.blocks);
            setDirty(false);
            if (
                advanceAfterSave &&
                currentBlockIndex < saved.blocks.length - 1
            ) {
                setCurrentBlockIndex((index) => index + 1);
            }
            setStatus({ kind: "success", message: "Saved" });
            return true;
        } catch (error) {
            setStatus({
                kind: "error",
                message: error instanceof Error ? error.message : String(error),
            });
            return false;
        }
    }

    async function moveToAdjacentBlock(direction: -1 | 1) {
        const nextIndex = currentBlockIndex + direction;
        if (
            !selectedFile ||
            documentView !== "detail" ||
            nextIndex < 0 ||
            nextIndex >= blocks.length ||
            status.kind === "saving" ||
            status.kind === "rebuilding"
        ) {
            return;
        }

        if (dirty && !(await save())) {
            return;
        }
        setCurrentBlockIndex(nextIndex);
    }

    async function rebuild() {
        if (!project || !selectedFile || project.mode === "separated-toml") {
            return;
        }
        const mismatchedBlockIndex = blocks.findIndex(
            (block) => !hasMatchingLineCount(block.origin, block.translate),
        );
        if (mismatchedBlockIndex !== -1) {
            setCurrentBlockIndex(mismatchedBlockIndex);
            setDocumentView("detail");
            setStatus({
                kind: "error",
                message: `Block ${mismatchedBlockIndex + 1}: translation line count must match the original before rebuilding.`,
            });
            return;
        }
        setStatus({ kind: "rebuilding", message: "Rebuilding current file" });
        setLastLog("");
        setShowLog(false);
        try {
            const result = (await window.i18nToolkit.rebuildDocument({
                projectRoot: project.rootPath,
                mode: project.mode,
                language,
                relativePath: selectedFile.relativePath,
                qwenApiKey: settings.qwenApiKey,
                qwenBaseUrl: settings.qwenBaseUrl,
            })) as RebuildResult;
            setLastLog(result.output || "");
            if (!result.ok) {
                setShowLog(true);
                setStatus({
                    kind: "error",
                    message: "Rebuild failed. Open the log for full output.",
                });
                return;
            }
            await loadSelected(selectedFile);
            setStatus({ kind: "success", message: "Rebuilt" });
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            setLastLog(message);
            setShowLog(true);
            setStatus({
                kind: "error",
                message: "Rebuild failed. Open the log for full output.",
            });
        }
    }

    useEffect(() => {
        const getRecentProjectPaths = "getRecentProjectPaths" in window.i18nToolkit
            ? window.i18nToolkit.getRecentProjectPaths
            : null;
        if (getRecentProjectPaths) {
            getRecentProjectPaths()
                .then((paths: string[]) => setRecentProjects(paths))
                .catch(() => setRecentProjects([]));
        } else {
            window.i18nToolkit
                .getLastProjectPath()
                .then((path: string | null) => setRecentProjects(path ? [path] : []))
                .catch(() => setRecentProjects([]));
        }

        window.i18nToolkit
            .getInitialProject()
            .then((initial: ProjectState | null) => {
                if (!initial) {
                    return;
                }
                applyProject(initial);
            })
            .catch((error: unknown) => {
                setStatus({
                    kind: "error",
                    message:
                        error instanceof Error ? error.message : String(error),
                });
            });

        return window.i18nToolkit.onOpenProjectRequest(() => {
            void chooseProject();
        });
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((!event.ctrlKey && !event.metaKey) || event.altKey) {
                return;
            }

            const key = event.key.toLowerCase();
            if (key !== "s" && key !== "n" && key !== "b") {
                return;
            }
            event.preventDefault();
            if (shortcutBusy.current) {
                return;
            }

            shortcutBusy.current = true;
            const action =
                key === "s"
                    ? save()
                    : moveToAdjacentBlock(key === "n" ? 1 : -1);
            void action.finally(() => {
                shortcutBusy.current = false;
            });
        };

        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [
        blocks,
        currentBlockIndex,
        dirty,
        document,
        documentView,
        language,
        project,
        selectedFile,
        status.kind,
    ]);

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
        const handleMedia = () =>
            setSystemTheme(media.matches ? "dark" : "light");
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
        if (!project || !language) {
            return;
        }

        if (project.mode === "separated-toml") {
            const previousPath = selectedFile?.relativePath;
            window.i18nToolkit
                .scanFiles(project.rootPath, project.mode, language)
                .then((files: DocFile[]) => {
                    setProject((current) =>
                        current ? { ...current, docs: files } : current,
                    );
                    const nextSelected = previousPath
                        ? files.find(
                              (file) => file.relativePath === previousPath,
                          )
                        : null;
                    if (nextSelected) {
                        void loadSelected(nextSelected, language);
                    } else {
                        clearDocumentState();
                        setStatus({
                            kind: "success",
                            message: "Language loaded",
                        });
                    }
                })
                .catch((error: unknown) => {
                    clearDocumentState();
                    setStatus({
                        kind: "error",
                        message:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                });
            return;
        }

        if (selectedFile) {
            void loadSelected(selectedFile, language);
        }
    }, [language]);

    if (!project) {
        return (
            <WindowFrame
                platform={platform}
                title="i18n Toolkit"
                onChooseProject={chooseProject}
                onOpenRecent={openRecentProject}
                onCloseProject={closeProject}
                recentProjects={recentProjects}
                hasProject={false}
                onOpenConfig={() => setControlPanelOpen(true)}
            >
                <ProjectPicker
                    onChoose={chooseProject}
                    recentProjects={recentProjects}
                    onOpenRecent={openRecentProject}
                    errorMessage={status.kind === "error" ? status.message : undefined}
                />
                <ControlPanel
                    open={controlPanelOpen}
                    settings={settings}
                    onChange={updateSettings}
                    onClose={() => setControlPanelOpen(false)}
                />
            </WindowFrame>
        );
    }

    return (
        <WindowFrame
            platform={platform}
            title={folderNameFromPath(project.rootPath)}
            subtitle={
                project.mode === "separated-toml"
                    ? "Separated TOML"
                    : "Docusaurus"
            }
            onChooseProject={chooseProject}
            onOpenRecent={openRecentProject}
            onCloseProject={closeProject}
            recentProjects={recentProjects}
            hasProject={true}
            onOpenConfig={() => setControlPanelOpen(true)}
        >
            <div className="app-shell">
                <aside className="sidebar">
                    <div className="sidebar-top">
                        <div>
                            <div className="project-label">
                                {folderNameFromPath(project.rootPath)}
                            </div>
                            <div
                                className="project-path"
                                title={project.rootPath}
                            >
                                {project.rootPath}
                            </div>
                            {project.validation.warnings.length ? (
                                <div
                                    className="project-warning"
                                    title={project.validation.warnings.join(
                                        "\n",
                                    )}
                                >
                                    <AlertTriangle size={13} />
                                    <span>
                                        {project.validation.warnings.length}{" "}
                                        project warning
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                    <label className="search-box">
                        <Search size={15} />
                        <input
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            placeholder={
                                isSeparatedToml ? "Filter TOML" : "Filter docs"
                            }
                        />
                    </label>
                    <FileTree
                        files={filteredDocs}
                        selected={selectedFile?.relativePath}
                        onSelect={(file) => void loadSelected(file)}
                    />
                </aside>

                <section className="workspace">
                    <header className="topbar">
                        <div className="current-file">
                            <button
                                type="button"
                                disabled={
                                    !selectedFile || documentView !== "detail"
                                }
                                onClick={() => setDocumentView("list")}
                                title={
                                    selectedFile && documentView === "detail"
                                        ? "Back to all keys"
                                        : (selectedFile?.relativePath ??
                                          "No document selected")
                                }
                            >
                                {filenameFromPath(selectedFile?.relativePath)}
                            </button>
                            {dirty ? <small>Unsaved</small> : null}
                        </div>
                        <div className="toolbar">
                            <LanguageDropdown
                                value={language}
                                languages={project.languages}
                                onChange={setLanguage}
                            />
                            {selectedFile && documentView === "detail" ? (
                                <>
                                    <label
                                        className="jump-control"
                                        title="Jump to block"
                                    >
                                        <Hash size={15} />
                                        <input
                                            type="number"
                                            min="1"
                                            max={Math.max(1, blocks.length)}
                                            value={
                                                blocks.length
                                                    ? currentBlockIndex + 1
                                                    : ""
                                            }
                                            disabled={
                                                !blocks.length ||
                                                status.kind === "saving" ||
                                                status.kind === "rebuilding"
                                            }
                                            onChange={(event) =>
                                                jumpToBlock(event.target.value)
                                            }
                                        />
                                        <span>/ {blocks.length}</span>
                                    </label>
                                    <button
                                        className="toolbar-button preview-button"
                                        onClick={() =>
                                            setCurrentBlockIndex((index) =>
                                                Math.max(0, index - 1),
                                            )
                                        }
                                        disabled={
                                            !canGoPrevious ||
                                            status.kind === "saving" ||
                                            status.kind === "rebuilding"
                                        }
                                        title="Previous key"
                                    >
                                        <ArrowLeft size={16} />
                                        Previous
                                    </button>
                                    <span className="block-counter">
                                        {blockPosition}
                                    </span>
                                    <button
                                        className="toolbar-button preview-button"
                                        onClick={() =>
                                            setCurrentBlockIndex((index) =>
                                                Math.min(
                                                    blocks.length - 1,
                                                    index + 1,
                                                ),
                                            )
                                        }
                                        disabled={
                                            !canGoNext ||
                                            status.kind === "saving" ||
                                            status.kind === "rebuilding"
                                        }
                                        title="Next key"
                                    >
                                        Next
                                        <ArrowRight size={16} />
                                    </button>
                                    <button
                                        className="toolbar-button strong"
                                        onClick={() => void save(true)}
                                        disabled={
                                            !dirty ||
                                            !document ||
                                            status.kind === "saving"
                                        }
                                    >
                                        {status.kind === "saving" ? (
                                            <Loader2
                                                className="spin"
                                                size={16}
                                            />
                                        ) : (
                                            <Save size={16} />
                                        )}
                                        Save & Next
                                    </button>
                                </>
                            ) : null}
                            {!isSeparatedToml ? (
                                <button
                                    className="toolbar-button"
                                    onClick={rebuild}
                                    disabled={
                                        !selectedFile ||
                                        status.kind === "rebuilding"
                                    }
                                >
                                    {status.kind === "rebuilding" ? (
                                        <Loader2 className="spin" size={16} />
                                    ) : (
                                        <RefreshCw size={16} />
                                    )}
                                    Rebuild
                                </button>
                            ) : null}
                        </div>
                    </header>

                    <div className={`status-line ${status.kind}`}>
                        {status.kind === "success" ? <Check size={15} /> : null}
                        <span>{status.message}</span>
                        {lastLog ? (
                            <button
                                className="log-toggle"
                                onClick={() =>
                                    setShowLog((visible) => !visible)
                                }
                            >
                                {showLog ? "Hide log" : "View log"}
                            </button>
                        ) : null}
                    </div>

                    {showLog && lastLog ? (
                        <section className="log-panel">
                            <div className="log-header">
                                <span>Rebuild log</span>
                                <button
                                    className="log-toggle"
                                    onClick={() => setShowLog(false)}
                                >
                                    Close
                                </button>
                            </div>
                            <pre>{lastLog}</pre>
                        </section>
                    ) : null}

                    {!selectedFile ? (
                        <div className="empty-state">
                            {isSeparatedToml
                                ? "Select a TOML file"
                                : "Select a document"}
                        </div>
                    ) : documentView === "list" ? (
                        document?.tomlExists ? (
                            <BlockTable
                                blocks={blocks}
                                onOpenBlock={openBlock}
                            />
                        ) : (
                            <div className="empty-state">
                                {isSeparatedToml
                                    ? "No TOML file for this entry."
                                    : "No TOML file for this document. Run rebuild."}
                            </div>
                        )
                    ) : (
                        <main className="translation-structure">
                            <div className="structure-header">
                                <div>Original</div>
                                <div>Translation</div>
                            </div>
                            <div className="blocks">
                                {currentBlock ? (
                                    <article
                                        className="block-pair single-block"
                                        key={
                                            currentBlock.key ||
                                            currentBlockIndex
                                        }
                                    >
                                        <div className="block-title">
                                            <span>
                                                Block {currentBlockIndex + 1}
                                            </span>
                                            <code>{currentBlock.key}</code>
                                        </div>
                                        <SyncedMdxEditors
                                            origin={normalizeTomlText(
                                                currentBlock.origin,
                                            )}
                                            translate={normalizeTomlText(
                                                currentBlock.translate,
                                            )}
                                            disabled={
                                                status.kind === "saving" ||
                                                status.kind === "rebuilding"
                                            }
                                            settings={settings}
                                            colorTheme={colorTheme}
                                            onChange={(nextValue) => {
                                                setBlocks((current) =>
                                                    current.map(
                                                        (item, itemIndex) =>
                                                            itemIndex ===
                                                            currentBlockIndex
                                                                ? {
                                                                      ...item,
                                                                      translate:
                                                                          toTomlText(
                                                                              nextValue,
                                                                              item.translate,
                                                                          ),
                                                                  }
                                                                : item,
                                                    ),
                                                );
                                                setDirty(true);
                                            }}
                                        />
                                        <div
                                            className="editor-progress"
                                            aria-label="Block progress"
                                        >
                                            <div
                                                style={{
                                                    width: `${progress}%`,
                                                }}
                                            />
                                        </div>
                                    </article>
                                ) : (
                                    <div className="empty-state">
                                        {document?.tomlExists
                                            ? "No TOML blocks"
                                            : isSeparatedToml
                                              ? "No TOML file for this entry."
                                              : "No TOML file for this document. Run rebuild."}
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
        </WindowFrame>
    );
}

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
