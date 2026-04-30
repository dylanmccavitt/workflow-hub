import {
  Bot,
  CheckCircle2,
  CircleDot,
  Command,
  GitBranch,
  GitPullRequest,
  Laptop,
  Play,
  Smartphone,
  Terminal,
  Workflow
} from "lucide-react";
import { issues, timeline } from "./data/demo";
import type { IssueCard, IssueStatus } from "./lib/types";

const statuses: IssueStatus[] = [
  "Ready",
  "In Progress",
  "Human Review",
  "Needs Fixes",
  "Merging",
  "Blocked",
  "Done"
];

const selected = issues[0];

function StatusPill({ status }: { status: IssueStatus }) {
  return <span className={`status-pill ${status.toLowerCase().split(" ").join("-")}`}>{status}</span>;
}

function IssueRow({ issue, active = false }: { issue: IssueCard; active?: boolean }) {
  return (
    <button className={`issue-row ${active ? "active" : ""}`}>
      <span className="issue-row-top">
        <span className="issue-id">{issue.id}</span>
        <StatusPill status={issue.status} />
      </span>
      <span className="issue-title">{issue.title}</span>
      <span className="issue-meta">
        <GitBranch size={13} />
        {issue.repo}
        <span>{issue.runner}</span>
      </span>
    </button>
  );
}

function ActionButton({
  icon,
  label,
  primary = false
}: {
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <button className={`action-button ${primary ? "primary" : ""}`} title={label}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function App() {
  return (
    <main className="app-shell">
      <nav className="rail" aria-label="Primary">
        <div className="brand-mark">WH</div>
        <button className="rail-button active" title="Workflow">
          <Workflow size={20} />
        </button>
        <button className="rail-button" title="Agents">
          <Bot size={20} />
        </button>
        <button className="rail-button" title="Terminal">
          <Terminal size={20} />
        </button>
      </nav>

      <aside className="sidebar">
        <header className="sidebar-header">
          <div>
            <p className="eyebrow">Local control plane</p>
            <h1>Workflow Hub</h1>
          </div>
          <button className="icon-button" title="Command menu">
            <Command size={18} />
          </button>
        </header>

        <section className="state-groups" aria-label="Issue states">
          {statuses.map((status) => {
            const count = issues.filter((issue) => issue.status === status).length;
            return (
              <button key={status} className="state-row">
                <span>{status}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </section>

        <section className="issue-list" aria-label="Issues">
          {issues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} active={issue.id === selected.id} />
          ))}
        </section>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">{selected.repo}</p>
            <h2>
              <span>{selected.id}</span>
              {selected.title}
            </h2>
          </div>
          <StatusPill status={selected.status} />
        </header>

        <section className="action-strip" aria-label="Issue actions">
          <ActionButton icon={<Laptop size={17} />} label="Open Zed" />
          <ActionButton icon={<Play size={17} />} label="Run Simulator" primary />
          <ActionButton icon={<Smartphone size={17} />} label="Run Device" />
          <ActionButton icon={<GitPullRequest size={17} />} label="Show PR" />
        </section>

        <section className="conversation">
          {timeline.map((event) => (
            <article key={event.id} className={`timeline-event ${event.tone}`}>
              <div className="event-icon">
                {event.tone === "success" ? <CheckCircle2 size={18} /> : <CircleDot size={18} />}
              </div>
              <div>
                <h3>{event.label}</h3>
                <p>{event.detail}</p>
              </div>
            </article>
          ))}
        </section>

        <footer className="command-bar">
          <Command size={17} />
          <span>Ask, dispatch, review, or run a command for {selected.id}</span>
          <kbd>⌘K</kbd>
        </footer>
      </section>

      <aside className="inspector">
        <section className="inspector-section">
          <h2>Workspace</h2>
          <dl>
            <div>
              <dt>Worktree</dt>
              <dd>{selected.worktree}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>{selected.branch}</dd>
            </div>
            <div>
              <dt>Review target</dt>
              <dd>{selected.buildTarget}</dd>
            </div>
          </dl>
        </section>

        <section className="inspector-section">
          <h2>Runners</h2>
          <div className="runner-row">
            <span>Symphony</span>
            <strong>Visible</strong>
          </div>
          <div className="runner-row">
            <span>Codex</span>
            <strong>Adapter</strong>
          </div>
          <div className="runner-row">
            <span>Cursor SDK</span>
            <strong>Harness</strong>
          </div>
        </section>

        <section className="inspector-section">
          <h2>Review</h2>
          <div className="review-line">
            <GitPullRequest size={16} />
            <span>{selected.pr ?? "No PR yet"}</span>
          </div>
          <div className="review-line">
            <Workflow size={16} />
            <span>{selected.lastEvent}</span>
          </div>
        </section>
      </aside>
    </main>
  );
}
