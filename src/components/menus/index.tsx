import { useEffect, useRef, useState } from "react";
import "./styles.css";

interface ProjectMenuProps {
    recentProjects: string[];
    hasProject: boolean;
    onChooseProject: () => void;
    onOpenRecent: (projectPath: string) => void;
    onCloseProject: () => void;
}

function folderNameFromPath(value: string) {
    const normalized = value.replace(/[\\/]+$/, "");
    return normalized.split(/[\\/]/).pop() || normalized;
}

export function ProjectMenu({
    recentProjects,
    hasProject,
    onChooseProject,
    onOpenRecent,
    onCloseProject,
}: ProjectMenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const visibleRecentProjects = recentProjects.slice(0, 5);

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

    const chooseProject = () => {
        setOpen(false);
        onChooseProject();
    };

    return (
        <div className="project-menu-wrap" ref={rootRef}>
            <button
                className="project-menu-trigger"
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen((visible) => !visible)}
            >
                Project
            </button>
            {open ? (
                <div className="project-menu" role="menu" aria-label="Project">
                    <button type="button" role="menuitem" onClick={chooseProject}>
                        Open Project...
                    </button>
                    <div className="project-menu-label">Recent Projects</div>
                    {visibleRecentProjects.length ? (
                        visibleRecentProjects.map((projectPath) => (
                            <button
                                key={projectPath}
                                type="button"
                                role="menuitem"
                                title={projectPath}
                                onClick={() => {
                                    setOpen(false);
                                    onOpenRecent(projectPath);
                                }}
                            >
                                {folderNameFromPath(projectPath)}
                            </button>
                        ))
                    ) : (
                        <div className="project-menu-empty">No recent projects</div>
                    )}
                    <div className="project-menu-divider" />
                    <button
                        type="button"
                        role="menuitem"
                        disabled={!hasProject}
                        onClick={() => {
                            setOpen(false);
                            onCloseProject();
                        }}
                    >
                        Close Project
                    </button>
                </div>
            ) : null}
        </div>
    );
}
