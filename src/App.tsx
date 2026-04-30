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
  RunnerBackend,
  SystemSignal,
  TimelineEvent,
  Tone
} from "./lib/types";
import type {
  AdapterState,
  LinearIssueDetails,
  PullRequestApiState,
  ReviewApiState,
  RunnerApiState,
  WorkflowIssueState
} from "./lib/workflowHubApi";

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

function labelForStatus(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toneForAdapter(adapter: AdapterState): Tone {
  if (adapter.status === "available") return "success";
  if (adapter.status === "unavailable") return "danger";
  if (adapter.status === "not-found") return "warning";
  return "neutral";
}

function signalFromAdapter(adapter: AdapterState): SystemSignal {
  return {
    label: adapter.label,
    value: labelForStatus(adapter.status),
    detail: adapter.ownerIssue ? `${adapter.detail} (${adapter.ownerIssue})` : adapter.detail,
    tone: toneForAdapter(adapter)
  };
}

function runnerFromApiState(runner: RunnerApiState): RunnerBackend {
  return {
    name: runner.kind,
    role: runner.role,
    state: labelForStatus(runner.status),
    detail: runner.detail
  };
}

function pullRequestLabel(pullRequest: PullRequestApiState | undefined) {
  if (!pullRequest) return "No PR adapter";
  return `${pullRequest.provider}: ${labelForStatus(pullRequest.status)}`;
}

function reviewLabel(review: ReviewApiState | undefined) {
  if (!review) return undefined;
  return `${labelForStatus(review.target)} review: ${labelForStatus(review.status)}`;
}

function issueReferenceText(issue: { identifier: string; title: string } | undefined) {
  if (!issue) return "None";
  return `${issue.identifier} ${issue.title}`;
}

function issueReferenceListText(issues: Array<{ identifier: string; title: string }>) {
  return issues.length > 0 ? issues.map(issueReferenceText).join(", ") : "None";
}

function labelsText(linearIssue: LinearIssueDetails | undefined) {
  return linearIssue?.labels.length ? linearIssue.labels.map((label) => label.name).join(", ") : "None";
}

function workpadText(linearIssue: LinearIssueDetails | undefined) {
  if (!linearIssue?.codexWorkpad) return "Not found";
  return linearIssue.codexWorkpad.updatedAt
    ? `Updated ${formatTimestamp(linearIssue.codexWorkpad.updatedAt)}`
    : "Found";
}

function cacheText(issueState: WorkflowIssueState | undefined) {
  const cache = issueState?.issue.linear?.cache ?? issueState?.issue.cache;
  if (!cache) return issueState?.issue.adapter.detail ?? "Waiting for Linear";

  const staleLabel = cache.stale ? " stale" : "";
  return `${labelForStatus(cache.status)}${staleLabel}`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function StatusPill({ status }: { status: string }) {
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
  issueState,
  apiError
}: {
  selectedIssue: IssueCard;
  issueState: WorkflowIssueState | undefined;
  apiError: string | undefined;
}) {
  const workspace = issueState?.workspace;
  const workspacePath = workspace?.found ? workspace.path : selectedIssue.worktree;
  const branch = workspace?.found ? workspace.branch : selectedIssue.branch;
  const headSha = workspace?.found ? workspace.headSha : undefined;
  const stateLabel = apiError
    ?? (workspace?.found
    ? workspace.dirty
      ? "Resolved with local changes"
      : "Resolved cleanly"
    : workspace?.adapter.detail ?? "Waiting for local API");

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
  const [issueState, setIssueState] = useState<WorkflowIssueState>();
  const [apiError, setApiError] = useState<string>();

  useEffect(() => {
    let isActive = true;

    if (!window.workflowHub?.issues?.getState) {
      setApiError("Desktop API unavailable in renderer preview");
      return;
    }

    window.workflowHub.issues.getState(selected.id)
      .then((state) => {
        if (!isActive) return;
        setIssueState(state);
        setApiError(undefined);
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        setApiError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      isActive = false;
    };
  }, []);

  const workspacePath = issueState?.workspace.found ? issueState.workspace.path : selected.worktree;
  const branch = issueState?.workspace.found ? issueState.workspace.branch : selected.branch;
  const linearIssue = issueState?.issue.linear;
  const displayTitle = linearIssue?.title ?? selected.title;
  const displayStatus = linearIssue?.status ?? selected.status;
  const displayProject = issueState?.project.displayName ?? selected.repo;
  const doneCount = useMemo(
    () => acceptanceCriteria.filter((criterion) => criterion.status === "Done").length,
    []
  );
  const platformLabel = window.workflowHub
    ? `${window.workflowHub.platform} / ${window.workflowHub.version}`
    : "browser preview";
  const sourceSignals = useMemo(
    () => issueState ? issueState.adapters.map(signalFromAdapter) : systemSignals,
    [issueState]
  );
  const visibleRunners = useMemo(
    () => issueState ? issueState.runners.map(runnerFromApiState) : runnerBackends,
    [issueState]
  );
  const pullRequestState = issueState?.pullRequests[0];
  const reviewState = issueState?.reviews[0];
  const linearPullRequest = linearIssue?.pullRequests[0];

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
            <p className="eyebrow">{displayProject}</p>
            <h2>
              <span>{selected.id}</span>
              {displayTitle}
            </h2>
          </div>
          <div className="header-metrics" aria-label="Track progress">
            <span>{doneCount}/{acceptanceCriteria.length} criteria</span>
            <StatusPill status={displayStatus} />
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
          <ResolutionPanel selectedIssue={selected} issueState={issueState} apiError={apiError} />

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
          <span>{selected.id} command target: {branch ?? "unresolved branch"}</span>
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
          <h2>Linear</h2>
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{linearIssue?.status ?? labelForStatus(issueState?.issue.status ?? "loading")}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{linearIssue?.priorityLabel ?? "Unknown"}</dd>
            </div>
            <div>
              <dt>Labels</dt>
              <dd>{labelsText(linearIssue)}</dd>
            </div>
            <div>
              <dt>Parent</dt>
              <dd>{issueReferenceText(linearIssue?.parent)}</dd>
            </div>
            <div>
              <dt>Blockers</dt>
              <dd>{issueReferenceListText(linearIssue?.blockers ?? [])}</dd>
            </div>
            <div>
              <dt>Workpad</dt>
              <dd>{workpadText(linearIssue)}</dd>
            </div>
            <div>
              <dt>Cache</dt>
              <dd>{cacheText(issueState)}</dd>
            </div>
          </dl>
        </section>

        <section className="inspector-section">
          <h2>Sources</h2>
          <div className="signal-list">
            {sourceSignals.map((signal) => (
              <SystemSignalRow key={signal.label} signal={signal} />
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <h2>Runners</h2>
          {visibleRunners.map((runner) => (
            <RunnerRow key={runner.name} runner={runner} />
          ))}
        </section>

        <section className="inspector-section">
          <h2>Review</h2>
          <div className="review-line">
            <GitPullRequest size={16} />
            <span>{selected.pr ?? linearPullRequest?.title ?? pullRequestLabel(pullRequestState)}</span>
          </div>
          <div className="review-line">
            <Workflow size={16} />
            <span>{reviewLabel(reviewState) ?? selected.lastEvent}</span>
          </div>
        </section>
      </aside>
    </main>
  );
}
