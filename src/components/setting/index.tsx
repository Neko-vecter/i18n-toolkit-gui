import { useEffect, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import "./styles.css";

export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
    themeMode: ThemeMode;
    editorFontSize: number;
    editorLineHeight: number;
    tabSize: number;
    wordWrap: boolean;
    syncScroll: boolean;
    minimap: boolean;
    qwenApiKey: string;
    qwenBaseUrl: string;
}

interface ControlPanelProps {
    open: boolean;
    settings: AppSettings;
    onChange: (settings: AppSettings) => void;
    onClose: () => void;
}

export function ControlPanel({
    open,
    settings,
    onChange,
    onClose,
}: ControlPanelProps) {
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    useEffect(() => {
        if (!shortcutsOpen) return;
        const handleKeyDown = (event: KeyboardEvent) =>
            event.key === "Escape" && setShortcutsOpen(false);
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [shortcutsOpen]);

    if (!open) return null;

    const update = <K extends keyof AppSettings>(
        key: K,
        value: AppSettings[K],
    ) => onChange({ ...settings, [key]: value });

    return (
        <aside className="control-panel" aria-label="Control panel">
            <header className="control-header">
                <div>
                    <span>Control panel</span>
                    <small>Editor and appearance</small>
                </div>
                <button
                    className="icon-button"
                    onClick={onClose}
                    title="Close control panel"
                >
                    <ChevronRight size={17} />
                </button>
            </header>
            <div className="control-content">
                <section className="setting-group">
                    <label>Theme</label>
                    <div className="segmented">
                        {(["light", "dark", "system"] as ThemeMode[]).map(
                            (mode) => (
                                <button
                                    key={mode}
                                    className={
                                        settings.themeMode === mode
                                            ? "active"
                                            : ""
                                    }
                                    onClick={() => update("themeMode", mode)}
                                >
                                    {mode}
                                </button>
                            ),
                        )}
                    </div>
                </section>
                <RangeSetting
                    label="Font size"
                    id="font-size"
                    min="11"
                    max="18"
                    value={settings.editorFontSize}
                    suffix="px"
                    onChange={(value) => update("editorFontSize", value)}
                />
                <RangeSetting
                    label="Line height"
                    id="line-height"
                    min="17"
                    max="30"
                    value={settings.editorLineHeight}
                    suffix="px"
                    onChange={(value) => update("editorLineHeight", value)}
                />
                <RangeSetting
                    label="Tab size"
                    id="tab-size"
                    min="2"
                    max="8"
                    value={settings.tabSize}
                    suffix="sp"
                    onChange={(value) => update("tabSize", value)}
                />
                <section className="setting-group toggles">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.wordWrap}
                            onChange={(event) =>
                                update("wordWrap", event.target.checked)
                            }
                        />
                        Word wrap
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.syncScroll}
                            onChange={(event) =>
                                update("syncScroll", event.target.checked)
                            }
                        />
                        Sync vertical scroll
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.minimap}
                            onChange={(event) =>
                                update("minimap", event.target.checked)
                            }
                        />
                        Minimap
                    </label>
                </section>
                <section className="setting-group ai-settings">
                    <label htmlFor="qwen-api-key">API key</label>
                    <input
                        id="qwen-api-key"
                        type="password"
                        autoComplete="off"
                        placeholder="API key"
                        value={settings.qwenApiKey}
                        onChange={(event) =>
                            update("qwenApiKey", event.target.value)
                        }
                    />
                    <label htmlFor="qwen-base-url">API address</label>
                    <input
                        id="qwen-base-url"
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        placeholder="API base URL"
                        value={settings.qwenBaseUrl}
                        onChange={(event) =>
                            update("qwenBaseUrl", event.target.value)
                        }
                    />
                </section>
                <section className="setting-group">
                    <label>Keyboard shortcuts</label>
                    <button
                        className="shortcut-button"
                        type="button"
                        onClick={() => setShortcutsOpen(true)}
                    >
                        View shortcuts
                    </button>
                </section>
            </div>
            {shortcutsOpen && (
                <ShortcutDialog onClose={() => setShortcutsOpen(false)} />
            )}
        </aside>
    );
}

function RangeSetting({
    label,
    id,
    min,
    max,
    value,
    suffix,
    onChange,
}: {
    label: string;
    id: string;
    min: string;
    max: string;
    value: number;
    suffix: string;
    onChange: (value: number) => void;
}) {
    return (
        <section className="setting-group">
            <label htmlFor={id}>{label}</label>
            <div className="range-row">
                <input
                    id={id}
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(event) => onChange(Number(event.target.value))}
                />
                <span>
                    {value}
                    {suffix}
                </span>
            </div>
        </section>
    );
}

function ShortcutDialog({ onClose }: { onClose: () => void }) {
    return (
        <div className="shortcut-dialog-backdrop" onMouseDown={onClose}>
            <section
                className="shortcut-dialog"
                role="dialog"
                aria-modal="true"
                aria-label="Keyboard shortcuts"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header>
                    <div>
                        <h2>Keyboard shortcuts</h2>
                        <p>Shortcuts are currently view-only.</p>
                    </div>
                    <button
                        className="icon-button"
                        type="button"
                        onClick={onClose}
                        title="Close shortcuts"
                    >
                        <X size={17} />
                    </button>
                </header>
                <dl className="shortcut-list">
                    <div>
                        <dt>Undo</dt>
                        <dd>Ctrl / ⌘ + Z</dd>
                    </div>
                    <div>
                        <dt>Save</dt>
                        <dd>Ctrl / ⌘ + S</dd>
                    </div>
                    <div>
                        <dt>Save and next key</dt>
                        <dd>Ctrl / ⌘ + N</dd>
                    </div>
                    <div>
                        <dt>Save and previous key</dt>
                        <dd>Ctrl / ⌘ + B</dd>
                    </div>
                </dl>
            </section>
        </div>
    );
}
