import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDot,
  Command,
  Database,
  GitBranch,
  GitPullRequest,
  Laptop,
  Play,
  RotateCw,
  Smartphone,
  Terminal,
  Workflow
} from "lucide-react";
import {
  acceptanceCriteria,
  dailyFlow,
  issues,
  runnerBackends,
  systemSignals,
  timeline
} from "./data/demo";
import type {
  AcceptanceCriterion,
  CriterionStatus,
  DailyFlowStep,
  IssueCard,
  IssueStatus,
  ResolvedWorkspace,
  RunnerBackend,
  SystemSignal,
  TimelineEvent,
  Tone
} from "./lib/types";

const statuses: IssueStatus[] = [
  "Backlog",
  "Ready",
  "In Progress",
  "Human Review",
  "Needs Fixes",
  "Merging",
  "Blocked",
  "Done"
];

const selected = issues[0];

function classNameFor(value: string) {
  return value.toLowerCase().replace(/[ /]+/g, "-");
}

function StatusPill({ status }: { status: IssueStatus }) {
  return <span className={`status-pill ${classNameFor(status)}`}>{status}</span>;
}

function CriterionPill({ status }: { status: CriterionStatus }) {
  return <span className={`criterion-pill ${classNameFor(status)}`}>{status}</span>;
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "success") return <CheckCircle2 size={18} />;
  if (tone === "warning") return <AlertTriangle size={18} />;
  return <CircleDot size={18} />;
}

function IssueRow({ issue, active = false }: { issue: IssueCard; active?: boolean }) {
  return (
    <button className={`issue-row ${active ? "active" : ""}`} type="button">
      <span className="issue-row-top">
        <span className="issue-id">{issue.id}</span>
        <StatusPill status={issue.status} />
      </span>
      <span className="issue-title">{issue.title}</span>
      <span className="issue-summary">{issue.summary}</span>
      <span className="issue-meta">
        <GitBranch size={13} />
        {issue.phase}
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
    <button className={`action-button ${primary ? "primary" : ""}`} title={label} type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ResolutionPanel({
  selectedIssue,
  resolvedWorkspace
}: {
  selectedIssue: IssueCard;
  resolvedWorkspace: ResolvedWorkspace | undefined;
}) {
  const workspacePath = resolvedWorkspace?.found ? resolvedWorkspace.path : selectedIssue.worktree;
  const branch = resolvedWorkspace?.found ? resolvedWorkspace.branch : selectedIssue.branch;
  const headSha = resolvedWorkspace?.found ? resolvedWorkspace.headSha : undefined;
  const stateLabel = resolvedWorkspace?.found
    ? resolvedWorkspace.dirty
      ? "Resolved with local changes"
      : "Resolved cleanly"
    : resolvedWorkspace?.error ?? "Waiting for desktop bridge";

  return (
    <section className="resolution-panel" aria-label="Issue resolver">
      <div>
        <p className="eyebrow">Issue resolver</p>
        <h3>{stateLabel}</h3>
      </div>
      <dl className="resolution-list">
        <div>
          <dt>Worktree</dt>
          <dd>{workspacePath ?? "Not found"}</dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>{branch ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Head</dt>
          <dd>{headSha ?? "Desktop only"}</dd>
        </div>
      </dl>
    </section>
  );
}

function FlowStep({ step, index }: { step: DailyFlowStep; index: number }) {
  return (
    <article className={`flow-step ${classNameFor(step.status)}`}>
      <span className="flow-index">{index + 1}</span>
      <div>
        <h3>{step.label}</h3>
        <p>{step.detail}</p>
      </div>
      <CriterionPill status={step.status} />
    </article>
  );
}

function AcceptanceRow({ item }: { item: AcceptanceCriterion }) {
  return (
    <article className="acceptance-row">
      <div>
        <span className="acceptance-owner">{item.ownerIssue}</span>
        <h3>{item.label}</h3>
        <p>{item.detail}</p>
      </div>
      <CriterionPill status={item.status} />
    </article>
  );
}

function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <article className={`timeline-event ${event.tone}`}>
      <div className="event-icon">
        <ToneIcon tone={event.tone} />
      </div>
      <div>
        <h3>{event.label}</h3>
        <p>{event.detail}</p>
      </div>
    </article>
  );
}

function SystemSignalRow({ signal }: { signal: SystemSignal }) {
  return (
    <div className={`signal-row ${signal.tone}`}>
      <div>
        <span>{signal.label}</span>
        <p>{signal.detail}</p>
      </div>
      <strong>{signal.value}</strong>
    </div>
  );
}

function RunnerRow({ runner }: { runner: RunnerBackend }) {
  return (
    <div className="runner-row">
      <div>
        <span>{runner.name}</span>
        <p>{runner.role}</p>
      </div>
      <strong>{runner.state}</strong>
    </div>
  );
}

export function App() {
  const [resolvedWorkspace, setResolvedWorkspace] = useState<ResolvedWorkspace>();

  useEffect(() => {
    let isActive = true;

    if (!window.workflowHub?.resolveIssueWorkspace) {
      setResolvedWorkspace({
        issueId: selected.id,
        found: false,
        error: "Desktop bridge unavailable in renderer preview"
      });
      return;
    }

    window.workflowHub.resolveIssueWorkspace(selected.id)
      .then((workspace) => {
        if (isActive) setResolvedWorkspace(workspace);
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        setResolvedWorkspace({
          issueId: selected.id,
          found: false,
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return () => {
      isActive = false;
    };
  }, []);

  const workspacePath = resolvedWorkspace?.found ? resolvedWorkspace.path : selected.worktree;
  const branch = resolvedWorkspace?.found ? resolvedWorkspace.branch : selected.branch;
  const doneCount = useMemo(
    () => acceptanceCriteria.filter((criterion) => criterion.status === "Done").length,
    []
  );
  const platformLabel = window.workflowHub
    ? `${window.workflowHub.platform} / ${window.workflowHub.version}`
    : "browser preview";

  return (
    <main className="app-shell">
      <nav className="rail" aria-label="Primary">
        <div className="brand-mark">WH</div>
        <button className="rail-button active" title="Workflow" type="button">
          <Workflow size={20} />
        </button>
        <button className="rail-button" title="Agents" type="button">
          <Bot size={20} />
        </button>
        <button className="rail-button" title="Registry" type="button">
          <Database size={20} />
        </button>
        <button className="rail-button" title="Terminal" type="button">
          <Terminal size={20} />
        </button>
      </nav>

      <aside className="sidebar">
        <header className="sidebar-header">
          <div>
            <p className="eyebrow">Local control plane</p>
            <h1>Workflow Hub</h1>
          </div>
          <button className="icon-button" title="Command menu" type="button">
            <Command size={18} />
          </button>
        </header>

        <section className="state-groups" aria-label="Issue states">
          {statuses.map((status) => {
            const count = issues.filter((issue) => issue.status === status).length;
            return (
              <button key={status} className="state-row" type="button">
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
          <div className="header-metrics" aria-label="Track progress">
            <span>{doneCount}/{acceptanceCriteria.length} criteria</span>
            <StatusPill status={selected.status} />
          </div>
        </header>

        <section className="action-strip" aria-label="Issue actions">
          <ActionButton icon={<Laptop size={17} />} label="Worktree" />
          <ActionButton icon={<Play size={17} />} label="Simulator" primary />
          <ActionButton icon={<Smartphone size={17} />} label="Device" />
          <ActionButton icon={<GitPullRequest size={17} />} label="PR" />
          <ActionButton icon={<RotateCw size={17} />} label="Sync" />
        </section>

        <section className="workspace-content">
          <ResolutionPanel selectedIssue={selected} resolvedWorkspace={resolvedWorkspace} />

          <section className="flow-board" aria-label="Daily workflow">
            <div className="section-heading">
              <p className="eyebrow">Daily flow</p>
              <h2>Ready to Done</h2>
            </div>
            <div className="flow-grid">
              {dailyFlow.map((step, index) => (
                <FlowStep key={step.label} step={step} index={index} />
              ))}
            </div>
          </section>

          <section className="acceptance-board" aria-label="Acceptance criteria">
            <div className="section-heading">
              <p className="eyebrow">Track scope</p>
              <h2>Acceptance Criteria</h2>
            </div>
            <div className="acceptance-list">
              {acceptanceCriteria.map((item) => (
                <AcceptanceRow key={item.id} item={item} />
              ))}
            </div>
          </section>

          <section className="conversation" aria-label="Timeline">
            {timeline.map((event) => (
              <TimelineRow key={event.id} event={event} />
            ))}
          </section>
        </section>

        <footer className="command-bar">
          <Command size={17} />
          <span>AGE-346 command target: {branch ?? "unresolved branch"}</span>
          <kbd>Cmd K</kbd>
        </footer>
      </section>

      <aside className="inspector">
        <section className="inspector-section">
          <h2>Workspace</h2>
          <dl>
            <div>
              <dt>Worktree</dt>
              <dd>{workspacePath ?? "Not found"}</dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd>{branch ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Desktop bridge</dt>
              <dd>{platformLabel}</dd>
            </div>
          </dl>
        </section>

        <section className="inspector-section">
          <h2>Sources</h2>
          <div className="signal-list">
            {systemSignals.map((signal) => (
              <SystemSignalRow key={signal.label} signal={signal} />
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <h2>Runners</h2>
          {runnerBackends.map((runner) => (
            <RunnerRow key={runner.name} runner={runner} />
          ))}
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
