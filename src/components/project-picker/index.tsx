import { FolderOpen, Languages, Upload } from "lucide-react";
import "./styles.css";

interface ProjectPickerProps {
  onChoose: () => void;
  recentProjects: string[];
  onOpenRecent: (projectPath: string) => void;
  errorMessage?: string;
}

function folderNameFromPath(value: string) {
  const normalized = value.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || normalized;
}

export function ProjectPicker({ onChoose, recentProjects, onOpenRecent, errorMessage }: ProjectPickerProps) {
  const visibleRecentProjects = recentProjects.slice(0, 2);

  return <main className="project-picker">
    <div className="project-picker-heading"><div className="project-picker-mark"><Languages size={28} /></div><div><h1>i18n Toolkit</h1><p>Open a translation project or continue where you left off.</p></div></div>
    <div className="project-picker-cards">
      <section className="project-picker-card"><div><h2>Open project</h2><p>Select a Docusaurus project with <code>docs/</code>, or a separated TOML project with <code>i18n-project.toml</code>.</p></div><button className="project-picker-open" type="button" onClick={onChoose}><Upload size={18} />Choose project</button></section>
      <section className="project-picker-card project-picker-recents" aria-label="Recent projects"><div><h2>Recent projects</h2><p>Quickly reopen a project you worked on recently.</p></div>{visibleRecentProjects.length ? <div className="project-picker-recent-list">{visibleRecentProjects.map((projectPath) => <button key={projectPath} type="button" onClick={() => onOpenRecent(projectPath)} title={projectPath}><FolderOpen size={16} /><span>{folderNameFromPath(projectPath)}</span><small>{projectPath}</small></button>)}</div> : <div className="project-picker-empty">No recent projects yet.</div>}</section>
    </div>
    {errorMessage ? <p className="project-picker-error">{errorMessage}</p> : null}
  </main>;
}
