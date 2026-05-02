import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Box,
  ChevronRight,
  CheckCircle2,
  CircleDot,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  GitFork,
  GitPullRequest,
  History,
  LayoutGrid,
  MessageSquareText,
  MessageCircle,
  PanelRight,
  Play,
  RotateCw,
  Save,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Smartphone,
  SquarePen,
  Terminal,
  Workflow
} from "lucide-react";
import {
  dailyFlow,
  runnerBackends,
  systemSignals
} from "./data/demo";
import type {
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
  CodexRunResult,
  CursorRunResult,
  DispatchReadyResult,
  DispatchRunnerKind,
  GitHubCheck,
  GitHubCheckAnnotation,
  GitHubPullRequestDiffLine,
  GitHubPullRequestFileDiff,
  GitHubPullRequestApiState,
  GitHubPullRequestDetails,
  GitHubReviewComment,
  GraphiteStackApiState,
  GraphiteStackBranch,
  LinearCacheState,
  LinearIssueDetails,
  LinearIssueReference,
  LinearStatusAction,
  PullRequestApiState,
  ReviewFixPromptDraft,
  ReviewApiState,
  RunnerApiState,
  RunnerNormalizedState,
  RunnerTimelineEntry,
  SecurityCredentialState,
  SecurityGuardrailState,
  WorkflowEvent,
  WorkflowIssueListState,
  WorkflowIssueState
} from "./lib/workflowHubApi";

const statuses: IssueStatus[] = [
  "Backlog",
  "Todo",
  "Ready",
  "In Progress",
  "Human Review",
  "In Review",
  "Needs Fixes",
  "Merging",
  "Blocked",
  "Done",
  "Canceled",
  "Duplicate"
];

const DEFAULT_ISSUE_ID = "AGE-346";

const fallbackLinearActions: LinearStatusAction[] = [
  { id: "ready", label: "Ready", stateName: "Ready", confirmationRequired: true },
  { id: "in-progress", label: "In Progress", stateName: "In Progress", confirmationRequired: true },
  { id: "human-review", label: "Human Review", stateName: "Human Review", confirmationRequired: true },
  { id: "needs-fixes", label: "Needs Fixes", stateName: "Needs Fixes", confirmationRequired: true },
  { id: "merging", label: "Merging", stateName: "Merging", confirmationRequired: true },
  { id: "done", label: "Done", stateName: "Done", confirmationRequired: true },
  { id: "blocked", label: "Blocked", stateName: "Blocked", confirmationRequired: false }
];

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
  const needsWorktree = runner.status === "not-found" && /worktree/i.test(runner.detail);
  return {
    name: runner.kind,
    role: runner.role,
    state: needsWorktree
      ? "Needs Worktree"
      : runner.latestRun ? labelForStatus(runner.latestRun.status) : labelForStatus(runner.status),
    detail: needsWorktree
      ? "Runner is configured; resolve this issue's worktree before starting a local run."
      : runner.detail
  };
}

function pullRequestLabel(pullRequest: PullRequestApiState | undefined) {
  if (!pullRequest) return "No PR adapter";
  return `${pullRequest.provider}: ${labelForStatus(pullRequest.status)}`;
}

function gitHubPullRequestState(states: PullRequestApiState[] | undefined): GitHubPullRequestApiState | undefined {
  return states?.find((state): state is GitHubPullRequestApiState => state.provider === "GitHub");
}

function graphiteStackState(states: PullRequestApiState[] | undefined): GraphiteStackApiState | undefined {
  return states?.find((state): state is GraphiteStackApiState => state.provider === "Graphite");
}

function pullRequestTone(pullRequest: GitHubPullRequestDetails): Tone {
  if (pullRequest.checks.status === "failing" || pullRequest.reviewDecision === "CHANGES_REQUESTED") {
    return "danger";
  }

  if (pullRequest.checks.status === "pending" || pullRequest.isDraft) return "warning";
  return "success";
}

function shortSha(value: string | undefined) {
  return value ? value.slice(0, 7) : "Unknown";
}

function bodyPreview(value: string, length = 180) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length - 1)}...` : compact;
}

function reviewCommentMeta(comment: GitHubReviewComment) {
  const author = comment.author ? `@${comment.author}` : "Unknown author";
  const location = comment.path
    ? `${comment.path}${comment.line ? `:${comment.line}` : ""}`
    : labelForStatus(comment.kind);
  return `${author} | ${location}`;
}

function reviewCommentSelectionId(comment: GitHubReviewComment, index: number) {
  return comment.id
    ?? comment.url
    ?? ["review-comment", comment.kind, comment.path ?? "general", comment.line ?? index].join(":");
}

function checkSelectionId(check: GitHubCheck, index: number) {
  return check.id
    ?? (typeof check.databaseId === "number" ? String(check.databaseId) : undefined)
    ?? `check:${check.name}:${index}`;
}

function selectableReviewComments(comments: GitHubReviewComment[]) {
  return comments
    .filter((comment) => comment.body.trim().length > 0)
    .map((comment, index) => ({
      id: reviewCommentSelectionId(comment, index),
      comment
    }));
}

function selectableCheckFailures(checks: GitHubCheck[]) {
  return checks
    .filter((check) => check.state === "failing" || check.annotations.length > 0)
    .map((check, index) => ({
      id: checkSelectionId(check, index),
      check
    }));
}

function selectionKey(values: string[]) {
  return values.join("|");
}

function reviewLabel(review: ReviewApiState | undefined) {
  if (!review) return undefined;
  return `${labelForStatus(review.target)} review: ${labelForStatus(review.status)}`;
}

function branchDisplay(branch: GraphiteStackBranch | undefined) {
  if (!branch) return "None";
  const position = branch.position ? ` (${branch.position})` : "";
  return `${branch.name}${position}`;
}

function branchListDisplay(branches: GraphiteStackBranch[]) {
  return branches.length > 0 ? branches.map(branchDisplay).join(", ") : "None";
}

function stackPositionText(stack: GraphiteStackApiState["stack"]) {
  if (!stack?.position || !stack.totalBranches) return "Unknown";
  return `${stack.position}/${stack.totalBranches}`;
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

function issueStatusFromLinear(status: string | undefined, fallback: IssueStatus): IssueStatus {
  return statuses.includes(status as IssueStatus) ? status as IssueStatus : fallback;
}

function runnerForLinearIssue(issue: LinearIssueDetails): IssueCard["runner"] {
  const searchable = [
    issue.title,
    issue.labels.map((label) => label.name).join(" ")
  ].join(" ");

  if (/cursor/i.test(searchable)) return "Cursor SDK";
  if (/symphony/i.test(searchable)) return "Symphony";
  return "Codex";
}

function dispatchRunnerForIssue(issue: LinearIssueDetails | undefined): DispatchRunnerKind {
  if (!issue) return "codex";
  return runnerForLinearIssue(issue) === "Cursor SDK" ? "cursor" : "codex";
}

function phaseForLinearIssue(issue: LinearIssueDetails) {
  const titlePhase = issue.title.match(/^\[([^\]]+)\]/)?.[1];
  const trackLabel = issue.labels.find((label) => label.name.startsWith("track:"))?.name.replace("track:", "");
  return titlePhase ?? (trackLabel ? labelForStatus(trackLabel) : "Workflow");
}

function riskForLinearIssue(issue: LinearIssueDetails): IssueCard["risk"] {
  const risk = issue.labels.find((label) => label.name.startsWith("risk:"))?.name.replace("risk:", "");
  return risk === "low" || risk === "high" ? risk : "medium";
}

function summaryForLinearIssue(issue: LinearIssueDetails) {
  const parts = [
    issue.cache.stale ? `${labelForStatus(issue.cache.status)} cache` : "Fresh cache",
    issue.blockers.length > 0 ? `${issue.blockers.length} blocker(s)` : undefined,
    issue.blockedIssues.length > 0 ? `${issue.blockedIssues.length} blocked issue(s)` : undefined,
    issue.pullRequests.length > 0 ? `${issue.pullRequests.length} PR link(s)` : undefined,
    issue.codexWorkpad ? "Workpad found" : "No Workpad"
  ];

  return parts.filter(Boolean).join(" | ");
}

function issueCardFromLinearIssue(issue: LinearIssueDetails, projectName: string | undefined): IssueCard {
  return {
    id: issue.identifier,
    title: issue.title,
    repo: projectName ?? "workflow-hub",
    status: issueStatusFromLinear(issue.status, "Backlog"),
    runner: runnerForLinearIssue(issue),
    branch: issue.branchName ?? "No branch linked",
    worktree: "Resolved on selection",
    pr: issue.pullRequests[0]?.title,
    lastEvent: issue.updatedAt ? `Linear updated ${formatTimestamp(issue.updatedAt)}` : cacheStatusText(issue.cache),
    buildTarget: "None",
    risk: riskForLinearIssue(issue),
    phase: phaseForLinearIssue(issue),
    summary: summaryForLinearIssue(issue)
  };
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

  return cacheStatusText(cache);
}

function cacheStatusText(cache: LinearCacheState) {
  if (cache.status === "stale") return "Stale";
  return cache.stale ? `${labelForStatus(cache.status)} stale` : labelForStatus(cache.status);
}

function formatCacheAge(ageMs: number | undefined) {
  if (typeof ageMs !== "number") return undefined;

  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 60) return `${seconds}s old`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m old`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h old`;

  return `${Math.round(hours / 24)}d old`;
}

function cacheNoticeDetail(cache: LinearCacheState, adapter: AdapterState | undefined) {
  const details = [
    cacheStatusText(cache),
    adapter?.detail,
    cache.error,
    cache.fetchedAt ? `Fetched ${formatTimestamp(cache.fetchedAt)}` : undefined,
    formatCacheAge(cache.ageMs)
  ].filter((detail): detail is string => Boolean(detail));

  return [...new Set(details)].join(" | ");
}

function toneForCache(cache: LinearCacheState | undefined): Tone {
  if (!cache) return "neutral";
  if (cache.status === "error") return "danger";
  if (cache.stale || cache.status === "not-configured" || cache.status === "miss") return "warning";
  return "success";
}

function toneForCredential(credential: SecurityCredentialState): Tone {
  if (credential.status === "available") return "success";
  if (credential.status === "unavailable") return "danger";
  if (credential.status === "not-checked") return "warning";
  return "neutral";
}

function securityCredentialSignal(credential: SecurityCredentialState): SystemSignal {
  const envSuffix = credential.envName ? ` | ${credential.envName}` : "";
  return {
    label: credential.label,
    value: labelForStatus(credential.status),
    detail: `${credential.detail}${envSuffix}`,
    tone: toneForCredential(credential)
  };
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

function timelineToneForEvent(event: WorkflowEvent): Tone {
  const normalizedState = typeof event.payload.normalizedState === "string"
    ? event.payload.normalizedState as RunnerNormalizedState
    : undefined;
  if (normalizedState) return toneForRunnerState(normalizedState);
  if (/failed|error/i.test(event.type)) return "danger";
  if (/blocked|needs-fixes|cancel/i.test(String(event.payload.nextStatus ?? event.message))) return "warning";
  return "success";
}

function toneForRunnerState(state: RunnerNormalizedState): Tone {
  if (state === "failed") return "danger";
  if (state === "blocked" || state === "cancelled" || state === "cancelling") return "warning";
  if (state === "succeeded") return "success";
  return "neutral";
}

function timelineFromRunnerTimelineEntry(entry: RunnerTimelineEntry): TimelineEvent {
  const rawStatus = entry.rawStatus && entry.rawStatus !== entry.normalizedState
    ? `raw ${labelForStatus(entry.rawStatus)}`
    : undefined;
  const debugParts = [
    entry.detail,
    entry.runId ? `run ${entry.runId}` : undefined,
    entry.agentId ? `agent ${entry.agentId}` : undefined,
    entry.sessionId ? `session ${entry.sessionId}` : undefined,
    entry.cwd ? `cwd ${entry.cwd}` : undefined,
    entry.logPath ? `log ${entry.logPath}` : undefined,
    entry.rawEvent ? "raw event stored" : undefined
  ];

  return {
    id: entry.id,
    label: `${entry.runnerKind}: ${entry.message}`,
    detail: [
      formatTimestamp(entry.createdAt),
      labelForStatus(entry.normalizedState),
      rawStatus,
      ...debugParts
    ].filter(Boolean).join(" | "),
    tone: toneForRunnerState(entry.normalizedState)
  };
}

function timelineFromWorkflowEvent(event: WorkflowEvent): TimelineEvent {
  if (/^codex\.(run|event)\./.test(event.type)) {
    const status = typeof event.payload.status === "string" ? labelForStatus(event.payload.status) : event.type;
    const summary = typeof event.payload.summary === "string" ? event.payload.summary : undefined;
    const cwd = typeof event.payload.cwd === "string" ? `cwd ${event.payload.cwd}` : undefined;
    const logPath = typeof event.payload.logPath === "string" ? `log ${event.payload.logPath}` : undefined;
    const boundary = event.payload.permissionBoundary && typeof event.payload.permissionBoundary === "object"
      ? event.payload.permissionBoundary as Record<string, unknown>
      : undefined;
    const boundaryDetail = typeof boundary?.sandbox === "string" && typeof boundary.approvalPolicy === "string"
      ? `sandbox ${boundary.sandbox}; approvals ${boundary.approvalPolicy}`
      : undefined;

    return {
      id: event.id,
      label: event.message,
      detail: [formatTimestamp(event.createdAt), status, summary, cwd, boundaryDetail, logPath]
        .filter(Boolean)
        .join(" | "),
      tone: timelineToneForEvent(event)
    };
  }

  const previousStatus = typeof event.payload.previousStatus === "string"
    ? event.payload.previousStatus
    : undefined;
  const nextStatus = typeof event.payload.nextStatus === "string"
    ? event.payload.nextStatus
    : undefined;
  const statusDetail = previousStatus && nextStatus
    ? `${previousStatus} -> ${nextStatus}`
    : event.type;

  return {
    id: event.id,
    label: event.message,
    detail: `${formatTimestamp(event.createdAt)} | ${statusDetail}`,
    tone: timelineToneForEvent(event)
  };
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${classNameFor(status)}`}>{status}</span>;
}

function StatusDot({ status }: { status: string }) {
  return <span aria-hidden="true" className={`status-dot ${classNameFor(status)}`} />;
}

function CriterionPill({ status }: { status: CriterionStatus }) {
  return <span className={`criterion-pill ${classNameFor(status)}`}>{status}</span>;
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "success") return <CheckCircle2 size={18} />;
  if (tone === "warning") return <AlertTriangle size={18} />;
  return <CircleDot size={18} />;
}

function IssueRow({
  issue,
  active = false,
  onSelect
}: {
  issue: IssueCard;
  active?: boolean;
  onSelect: (issueId: string) => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`issue-row ${active ? "active" : ""}`}
      onClick={() => onSelect(issue.id)}
      type="button"
    >
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

function IssueStateGroup({
  status,
  issues,
  active,
  selectedIssueId,
  onToggle,
  onSelect
}: {
  status: IssueStatus;
  issues: IssueCard[];
  active: boolean;
  selectedIssueId: string;
  onToggle: () => void;
  onSelect: (issueId: string) => void;
}) {
  const visibleIssues = active ? issues : issues.slice(0, 4);
  return (
    <section className={`state-group-block ${active ? "active" : ""}`}>
      <button
        aria-pressed={active}
        className="state-group-header"
        onClick={onToggle}
        type="button"
      >
        <span>
          <StatusDot status={status} />
          {status}
        </span>
        <strong>{issues.length}</strong>
      </button>
      {visibleIssues.length > 0 ? (
        <div className="state-group-issues">
          {visibleIssues.map((issue) => (
            <IssueRow
              active={issue.id === selectedIssueId}
              issue={issue}
              key={issue.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <p className="state-group-empty">No cached issues</p>
      )}
      {!active && issues.length > visibleIssues.length ? (
        <button className="state-group-more" onClick={onToggle} type="button">
          {issues.length - visibleIssues.length} more
        </button>
      ) : null}
    </section>
  );
}

function initialSelectedIssueId() {
  const params = new URLSearchParams(window.location.search);
  const requestedIssueId = params.get("issue")?.toUpperCase();
  return requestedIssueId && /^[a-z]+-\d+$/i.test(requestedIssueId)
    ? requestedIssueId
    : DEFAULT_ISSUE_ID;
}

function issueCardFromState(issueId: string, issueState: WorkflowIssueState | undefined): IssueCard {
  const linearIssue = issueState?.issue.linear;
  const workspace = issueState?.workspace;
  const pullRequestState = gitHubPullRequestState(issueState?.pullRequests);
  const baseIssue = linearIssue
    ? issueCardFromLinearIssue(linearIssue, issueState?.project.displayName)
    : undefined;
  const summary = pullRequestState?.detail
    ?? workspace?.adapter.detail
    ?? issueState?.issue.adapter.detail
    ?? "Dynamic issue loaded from the local workflow API.";

  return {
    id: issueId,
    title: baseIssue?.title ?? "Loading issue state",
    repo: baseIssue?.repo ?? issueState?.project.displayName ?? "workflow-hub",
    status: baseIssue?.status ?? issueStatusFromLinear(linearIssue?.status, "Backlog"),
    runner: baseIssue?.runner ?? "Codex",
    branch: workspace?.branch ?? "Resolving branch",
    worktree: workspace?.path ?? "Resolving issue workspace",
    pr: pullRequestState?.pullRequest
      ? `#${pullRequestState.pullRequest.number} ${pullRequestState.pullRequest.title}`
      : baseIssue?.pr,
    lastEvent: pullRequestState?.detail ?? issueState?.issue.adapter.detail ?? "Loading local API state",
    buildTarget: "None",
    risk: baseIssue?.risk ?? "medium",
    phase: baseIssue?.phase ?? "Workflow Visibility",
    summary
  };
}

function GraphiteBranchRow({ branch }: { branch: GraphiteStackBranch }) {
  const label = branch.position ? `${branch.position}. ${branch.name}` : branch.name;
  const state = branch.submitState ?? (branch.prNumber ? "Submitted" : "Local only");
  const content = (
    <>
      <span>{label}</span>
      <strong>{state}</strong>
    </>
  );

  return branch.graphiteUrl ? (
    <a className={`stack-branch-row ${branch.current ? "current" : ""}`} href={branch.graphiteUrl} rel="noreferrer" target="_blank">
      {content}
    </a>
  ) : (
    <div className={`stack-branch-row ${branch.current ? "current" : ""}`}>{content}</div>
  );
}

function ActionButton({
  icon,
  label,
  disabled = false,
  href,
  onClick,
  primary = false
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
}) {
  const content = (
    <>
      {icon}
      <span>{label}</span>
    </>
  );

  if (href && !disabled) {
    return (
      <a className={`action-button ${primary ? "primary" : ""}`} href={href} rel="noreferrer" target="_blank">
        {content}
      </a>
    );
  }

  return (
    <button
      className={`action-button ${primary ? "primary" : ""}`}
      disabled={disabled || !onClick}
      onClick={onClick}
      title={label}
      type="button"
    >
      {content}
    </button>
  );
}

function LinearActionBoard({
  actions,
  currentStatus,
  pendingActionId,
  disabled,
  onSelect
}: {
  actions: LinearStatusAction[];
  currentStatus: string;
  pendingActionId: string | undefined;
  disabled: boolean;
  onSelect: (action: LinearStatusAction) => void;
}) {
  return (
    <section className="linear-actions" aria-label="Linear status actions">
      <div className="section-heading">
        <p className="eyebrow">Linear writes</p>
        <h2>Status Actions</h2>
      </div>
      <div className="linear-action-grid">
        {actions.map((action) => {
          const isCurrent = action.stateName === currentStatus;
          const isPending = action.id === pendingActionId;
          return (
            <button
              key={action.id}
              className={`linear-action ${isCurrent ? "current" : ""} ${isPending ? "pending" : ""}`}
              disabled={disabled}
              onClick={() => onSelect(action)}
              type="button"
            >
              <span>{action.label}</span>
              {action.confirmationRequired ? <ShieldAlert size={15} /> : <ArrowRight size={15} />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ConfirmationBoundary({
  action,
  issueId,
  currentStatus,
  note,
  riskAccepted,
  sensitiveDataAccepted,
  writeError,
  isWriting,
  onNoteChange,
  onRiskAcceptedChange,
  onSensitiveDataAcceptedChange,
  onCancel,
  onApply
}: {
  action: LinearStatusAction;
  issueId: string;
  currentStatus: string;
  note: string;
  riskAccepted: boolean;
  sensitiveDataAccepted: boolean;
  writeError: string | undefined;
  isWriting: boolean;
  onNoteChange: (value: string) => void;
  onRiskAcceptedChange: (value: boolean) => void;
  onSensitiveDataAcceptedChange: (value: boolean) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  const applyDisabled = isWriting || (action.confirmationRequired && !riskAccepted);

  return (
    <section className="confirmation-boundary" aria-label="Linear write confirmation">
      <div className="confirmation-copy">
        <p className="eyebrow">Confirm write</p>
        <h3>
          {issueId}: {currentStatus} <ArrowRight size={16} /> {action.stateName}
        </h3>
        {action.confirmationRequired ? (
          <p>{action.confirmationReason ?? "This state can trigger external workflow activity."}</p>
        ) : (
          <p>Workflow Hub will update Linear and append a structured Workpad note.</p>
        )}
      </div>
      <label className="note-field">
        <span>
          <MessageSquareText size={15} />
          Workpad note
        </span>
        <textarea
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Optional note appended under ### Notes"
          rows={3}
          value={note}
        />
      </label>
      {action.confirmationRequired ? (
        <label className="risk-check">
          <input
            checked={riskAccepted}
            onChange={(event) => onRiskAcceptedChange(event.target.checked)}
            type="checkbox"
          />
          <span>Confirm this explicit Linear state change.</span>
        </label>
      ) : null}
      <label className="risk-check">
        <input
          checked={sensitiveDataAccepted}
          onChange={(event) => onSensitiveDataAcceptedChange(event.target.checked)}
          type="checkbox"
        />
        <span>Allow sensitive content in the Workpad note if this note intentionally includes it.</span>
      </label>
      {writeError ? <p className="write-error">{writeError}</p> : null}
      <div className="confirmation-actions">
        <button className="secondary-button" disabled={isWriting} onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="action-button primary" disabled={applyDisabled} onClick={onApply} type="button">
          {isWriting ? "Writing..." : "Apply"}
        </button>
      </div>
    </section>
  );
}

function FixPromptPanel({
  issueId,
  issueState,
  pullRequestState,
  onSaved
}: {
  issueId: string;
  issueState: WorkflowIssueState | undefined;
  pullRequestState: GitHubPullRequestApiState | undefined;
  onSaved: () => Promise<void>;
}) {
  const pullRequest = pullRequestState?.pullRequest;
  const reviewOptions = useMemo(
    () => selectableReviewComments(pullRequest?.reviewComments ?? []),
    [pullRequest]
  );
  const checkOptions = useMemo(
    () => selectableCheckFailures(pullRequest?.checks.checks ?? []),
    [pullRequest]
  );
  const optionKey = `${issueId}:${selectionKey(reviewOptions.map((option) => option.id))}:${selectionKey(checkOptions.map((option) => option.id))}`;
  const [selectedReviewCommentIds, setSelectedReviewCommentIds] = useState<string[]>([]);
  const [selectedCheckIds, setSelectedCheckIds] = useState<string[]>([]);
  const [promptDraft, setPromptDraft] = useState<ReviewFixPromptDraft>();
  const [promptText, setPromptText] = useState("");
  const [promptError, setPromptError] = useState<string>();
  const [savedEventId, setSavedEventId] = useState<string>();
  const [isDrafting, setIsDrafting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const canDraft = Boolean(window.workflowHub?.issues?.draftFixPrompt);
  const canSave = Boolean(window.workflowHub?.issues?.saveFixPrompt);

  useEffect(() => {
    setSelectedReviewCommentIds(reviewOptions.map((option) => option.id));
    setSelectedCheckIds(checkOptions.map((option) => option.id));
    setPromptDraft(undefined);
    setPromptText("");
    setPromptError(undefined);
    setSavedEventId(undefined);
  }, [optionKey]);

  const toggleReviewComment = (id: string, checked: boolean) => {
    setSelectedReviewCommentIds((current) => checked
      ? [...new Set([...current, id])]
      : current.filter((candidate) => candidate !== id));
  };

  const toggleCheck = (id: string, checked: boolean) => {
    setSelectedCheckIds((current) => checked
      ? [...new Set([...current, id])]
      : current.filter((candidate) => candidate !== id));
  };

  const draftPayload = {
    issueId,
    selectedReviewCommentIds,
    selectedCheckIds
  };

  const handleDraftPrompt = async () => {
    if (!window.workflowHub?.issues?.draftFixPrompt) return;

    setIsDrafting(true);
    setPromptError(undefined);
    setSavedEventId(undefined);
    try {
      const draft = await window.workflowHub.issues.draftFixPrompt(draftPayload);
      setPromptDraft(draft);
      setPromptText(draft.prompt);
    } catch (error: unknown) {
      setPromptError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSavePrompt = async () => {
    if (!window.workflowHub?.issues?.saveFixPrompt || promptText.trim().length === 0) return;

    setIsSaving(true);
    setPromptError(undefined);
    try {
      const saved = await window.workflowHub.issues.saveFixPrompt({
        ...draftPayload,
        prompt: promptText
      });
      setPromptDraft(saved);
      setPromptText(saved.prompt);
      setSavedEventId(saved.event.id);
      await onSaved();
    } catch (error: unknown) {
      setPromptError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="fix-prompt-panel" aria-label="Review fix prompt builder">
      <div className="section-heading">
        <p className="eyebrow">PR review</p>
        <h2>Fix Prompt</h2>
      </div>

      <div className="fix-prompt-grid">
        <div className="fix-prompt-source">
          <h3>Review Comments</h3>
          {reviewOptions.length > 0 ? (
            <div className="fix-selection-list">
              {reviewOptions.map(({ id, comment }) => (
                <label className="fix-selection-row" key={id}>
                  <input
                    checked={selectedReviewCommentIds.includes(id)}
                    onChange={(event) => toggleReviewComment(id, event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{reviewCommentMeta(comment)}</strong>
                    <small>{bodyPreview(comment.body, 130)}</small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p>No review comments loaded.</p>
          )}
        </div>

        <div className="fix-prompt-source">
          <h3>Check Failures</h3>
          {checkOptions.length > 0 ? (
            <div className="fix-selection-list">
              {checkOptions.map(({ id, check }) => (
                <label className="fix-selection-row" key={id}>
                  <input
                    checked={selectedCheckIds.includes(id)}
                    onChange={(event) => toggleCheck(id, event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{check.name}</strong>
                    <small>{labelForStatus(check.state)} | {check.annotations.length} annotation(s)</small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p>No failing checks loaded.</p>
          )}
        </div>
      </div>

      {promptDraft ? (
        <dl className="fix-prompt-meta">
          <div>
            <dt>Branch</dt>
            <dd>{promptDraft.branch ?? issueState?.workspace.branch ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Worktree</dt>
            <dd>{promptDraft.worktree ?? issueState?.workspace.path ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Owned paths</dt>
            <dd>{promptDraft.ownedPaths.length > 0 ? promptDraft.ownedPaths.join(", ") : "None selected"}</dd>
          </div>
        </dl>
      ) : null}

      <label className="prompt-editor">
        <span>
          <FileText size={15} />
          Prompt Draft
        </span>
        <textarea
          onChange={(event) => setPromptText(event.target.value)}
          placeholder="Generate a prompt from the selected PR context"
          rows={12}
          value={promptText}
        />
      </label>

      {promptError ? <p className="write-error">{promptError}</p> : null}
      {savedEventId ? <p className="prompt-save-note">Saved event {savedEventId}</p> : null}

      <div className="fix-prompt-actions">
        <button
          className="secondary-button"
          disabled={isDrafting || !canDraft}
          onClick={handleDraftPrompt}
          type="button"
        >
          {isDrafting ? "Generating..." : "Generate Draft"}
        </button>
        <button
          className="action-button primary"
          disabled={isSaving || !canSave || promptText.trim().length === 0}
          onClick={handleSavePrompt}
          type="button"
        >
          <Save size={15} />
          {isSaving ? "Saving..." : "Save to Timeline"}
        </button>
      </div>
    </section>
  );
}

function CodexRunPanel({
  issueId,
  issueState,
  onFinished
}: {
  issueId: string;
  issueState: WorkflowIssueState | undefined;
  onFinished: () => Promise<void>;
}) {
  const codexRunner = issueState?.runners.find((runner) => runner.kind === "Codex");
  const defaultCommand = codexRunner?.config?.command ?? "codex";
  const defaultModel = codexRunner?.config?.model ?? "";
  const defaultSandbox = codexRunner?.config?.sandbox ?? "workspace-write";
  const defaultApprovalPolicy = codexRunner?.config?.approvalPolicy ?? "never";
  const [command, setCommand] = useState(defaultCommand);
  const [model, setModel] = useState(defaultModel);
  const [sandbox, setSandbox] = useState(defaultSandbox);
  const [approvalPolicy, setApprovalPolicy] = useState(defaultApprovalPolicy);
  const [prompt, setPrompt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sensitiveDataConfirmed, setSensitiveDataConfirmed] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
  const [lastResult, setLastResult] = useState<CodexRunResult>();
  const latestRun = codexRunner?.latestRun;
  const latestLogPath = typeof latestRun?.metadata.logPath === "string" ? latestRun.metadata.logPath : undefined;
  const canRun = Boolean(
    window.workflowHub?.issues?.startCodexRun
    && issueState?.workspace.found
    && prompt.trim().length > 0
    && command.trim().length > 0
    && sandbox.trim().length > 0
    && approvalPolicy.trim().length > 0
    && confirmed
    && !isRunning
  );

  useEffect(() => {
    setCommand(defaultCommand);
    setModel(defaultModel);
    setSandbox(defaultSandbox);
    setApprovalPolicy(defaultApprovalPolicy);
    setPrompt("");
    setConfirmed(false);
    setSensitiveDataConfirmed(false);
    setRunError(undefined);
    setLastResult(undefined);
  }, [defaultApprovalPolicy, defaultCommand, defaultModel, defaultSandbox, issueId]);

  const handleStartCodexRun = async () => {
    if (!window.workflowHub?.issues?.startCodexRun) return;

    setIsRunning(true);
    setRunError(undefined);
    try {
      const result = await window.workflowHub.issues.startCodexRun({
        issueId,
        prompt,
        command,
        model: model.trim() || undefined,
        sandbox,
        approvalPolicy,
        confirmed,
        sensitiveDataConfirmed
      });
      setLastResult(result);
      setPrompt("");
      setConfirmed(false);
      setSensitiveDataConfirmed(false);
      await onFinished();
    } catch (error: unknown) {
      setRunError(error instanceof Error ? error.message : String(error));
      await onFinished();
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="codex-run-panel" aria-label="Codex runner">
      <div className="section-heading">
        <p className="eyebrow">Codex CLI</p>
        <h2>Local Run</h2>
      </div>

      <div className="cursor-run-grid codex-run-grid">
        <label>
          <span>Command</span>
          <input
            onChange={(event) => setCommand(event.target.value)}
            value={command}
          />
        </label>
        <label>
          <span>Model</span>
          <input
            onChange={(event) => setModel(event.target.value)}
            placeholder="Default"
            value={model}
          />
        </label>
        <label>
          <span>Sandbox</span>
          <select
            onChange={(event) => setSandbox(event.target.value)}
            value={sandbox}
          >
            <option value="workspace-write">workspace-write</option>
            <option value="read-only">read-only</option>
          </select>
        </label>
        <label>
          <span>Approvals</span>
          <select
            onChange={(event) => setApprovalPolicy(event.target.value)}
            value={approvalPolicy}
          >
            <option value="never">never</option>
            <option value="on-request">on-request</option>
            <option value="untrusted">untrusted</option>
            <option value="on-failure">on-failure</option>
          </select>
        </label>
        <label className="cursor-prompt codex-prompt">
          <span>Prompt</span>
          <textarea
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Prompt for Codex"
            rows={5}
            value={prompt}
          />
        </label>
      </div>

      <dl className="cursor-run-meta codex-run-meta">
        <div>
          <dt>Worktree</dt>
          <dd>{issueState?.workspace.path ?? "Not resolved"}</dd>
        </div>
        <div>
          <dt>Boundary</dt>
          <dd>{sandbox} / {approvalPolicy}</dd>
        </div>
        <div>
          <dt>Latest</dt>
          <dd>{latestRun ? `${labelForStatus(latestRun.status)} | ${latestRun.summary ?? latestRun.id}` : "No local run"}</dd>
        </div>
        <div>
          <dt>Log</dt>
          <dd>{latestLogPath ?? lastResult?.logPath ?? "Pending"}</dd>
        </div>
      </dl>

      <StateNotice
        compact
        detail="Codex receives the prompt. Workspace-write can mutate only the resolved issue worktree."
        title="Confirmation Required"
        tone="warning"
      />
      <div className="runner-confirmations">
        <label className="risk-check">
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>Confirm this Codex runner start and prompt transmission.</span>
        </label>
        <label className="risk-check">
          <input
            checked={sensitiveDataConfirmed}
            onChange={(event) => setSensitiveDataConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>Allow sensitive prompt content if this run intentionally includes it.</span>
        </label>
      </div>

      {runError ? <p className="write-error">{runError}</p> : null}
      {lastResult ? (
        <p className="prompt-save-note">
          {lastResult.runId ?? "Codex run"} {labelForStatus(lastResult.status)}
        </p>
      ) : null}

      <button
        className="action-button primary"
        disabled={!canRun}
        onClick={handleStartCodexRun}
        type="button"
      >
        <Terminal size={15} />
        {isRunning ? "Running..." : "Run"}
      </button>
    </section>
  );
}

function CursorRunPanel({
  issueId,
  issueState,
  onFinished
}: {
  issueId: string;
  issueState: WorkflowIssueState | undefined;
  onFinished: () => Promise<void>;
}) {
  const cursorRunner = issueState?.runners.find((runner) => runner.kind === "Cursor SDK");
  const defaultModel = cursorRunner?.config?.model ?? "composer-2";
  const [model, setModel] = useState(defaultModel);
  const [prompt, setPrompt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sensitiveDataConfirmed, setSensitiveDataConfirmed] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
  const [lastResult, setLastResult] = useState<CursorRunResult>();
  const latestRun = cursorRunner?.latestRun;
  const canRun = Boolean(
    window.workflowHub?.issues?.startCursorRun
    && issueState?.workspace.found
    && prompt.trim().length > 0
    && model.trim().length > 0
    && confirmed
    && !isRunning
  );

  useEffect(() => {
    setModel(defaultModel);
    setPrompt("");
    setConfirmed(false);
    setSensitiveDataConfirmed(false);
    setRunError(undefined);
    setLastResult(undefined);
  }, [defaultModel, issueId]);

  const handleStartCursorRun = async () => {
    if (!window.workflowHub?.issues?.startCursorRun) return;

    setIsRunning(true);
    setRunError(undefined);
    try {
      const result = await window.workflowHub.issues.startCursorRun({
        issueId,
        prompt,
        model,
        confirmed,
        sensitiveDataConfirmed
      });
      setLastResult(result);
      setPrompt("");
      setConfirmed(false);
      setSensitiveDataConfirmed(false);
      await onFinished();
    } catch (error: unknown) {
      setRunError(error instanceof Error ? error.message : String(error));
      await onFinished();
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <section className="cursor-run-panel" aria-label="Cursor runner">
      <div className="section-heading">
        <p className="eyebrow">Cursor SDK</p>
        <h2>Local Run</h2>
      </div>

      <div className="cursor-run-grid">
        <label>
          <span>Model</span>
          <input
            onChange={(event) => setModel(event.target.value)}
            value={model}
          />
        </label>
        <label className="cursor-prompt">
          <span>Prompt</span>
          <textarea
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Prompt for Cursor agent"
            rows={5}
            value={prompt}
          />
        </label>
      </div>

      <dl className="cursor-run-meta">
        <div>
          <dt>Worktree</dt>
          <dd>{issueState?.workspace.path ?? "Not resolved"}</dd>
        </div>
        <div>
          <dt>Config</dt>
          <dd>{cursorRunner?.config?.configPath ?? "Not configured"}</dd>
        </div>
        <div>
          <dt>Latest</dt>
          <dd>{latestRun ? `${labelForStatus(latestRun.status)} | ${latestRun.summary ?? latestRun.id}` : "No local run"}</dd>
        </div>
      </dl>

      <StateNotice
        compact
        detail="Cursor receives the prompt and runs against the selected issue worktree."
        title="Confirmation Required"
        tone="warning"
      />
      <div className="runner-confirmations">
        <label className="risk-check">
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>Confirm this Cursor runner start and prompt transmission.</span>
        </label>
        <label className="risk-check">
          <input
            checked={sensitiveDataConfirmed}
            onChange={(event) => setSensitiveDataConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>Allow sensitive prompt content if this run intentionally includes it.</span>
        </label>
      </div>

      {runError ? <p className="write-error">{runError}</p> : null}
      {lastResult ? (
        <p className="prompt-save-note">
          {lastResult.runId ?? "Cursor run"} {labelForStatus(lastResult.status)}
        </p>
      ) : null}

      <button
        className="action-button primary"
        disabled={!canRun}
        onClick={handleStartCursorRun}
        type="button"
      >
        <Play size={15} />
        {isRunning ? "Running..." : "Run"}
      </button>
    </section>
  );
}

function ReadyDispatchPanel({
  issueId,
  issueState,
  onFinished
}: {
  issueId: string;
  issueState: WorkflowIssueState | undefined;
  onFinished: () => Promise<void>;
}) {
  const linearIssue = issueState?.issue.linear;
  const defaultRunnerKind = dispatchRunnerForIssue(linearIssue);
  const [runnerKind, setRunnerKind] = useState<DispatchRunnerKind>(defaultRunnerKind);
  const [prompt, setPrompt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [sensitiveDataConfirmed, setSensitiveDataConfirmed] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string>();
  const [lastResult, setLastResult] = useState<DispatchReadyResult>();
  const currentStatus = linearIssue?.status ?? issueState?.issue.status ?? "Unknown";
  const dispatchable = ["Ready", "Todo", "In Progress"].includes(currentStatus);
  const canDispatch = Boolean(
    window.workflowHub?.issues?.dispatchReady
    && issueState
    && dispatchable
    && confirmed
    && !isDispatching
  );

  useEffect(() => {
    setRunnerKind(defaultRunnerKind);
    setPrompt("");
    setConfirmed(false);
    setSensitiveDataConfirmed(false);
    setDryRun(false);
    setDispatchError(undefined);
    setLastResult(undefined);
  }, [defaultRunnerKind, issueId]);

  const handleDispatch = async () => {
    if (!window.workflowHub?.issues?.dispatchReady) return;

    setIsDispatching(true);
    setDispatchError(undefined);
    try {
      const result = await window.workflowHub.issues.dispatchReady({
        issueId,
        runnerKind,
        prompt: prompt.trim() || undefined,
        confirmed,
        sensitiveDataConfirmed,
        dryRun
      });
      setLastResult(result);
      setPrompt("");
      setConfirmed(false);
      setSensitiveDataConfirmed(false);
      await onFinished();
    } catch (error: unknown) {
      setDispatchError(error instanceof Error ? error.message : String(error));
      await onFinished();
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <section className="dispatch-panel" aria-label="Ready issue dispatch">
      <div className="section-heading">
        <p className="eyebrow">Flow</p>
        <h2>Ready Dispatch</h2>
      </div>

      <div className="dispatch-grid">
        <label>
          <span>Runner</span>
          <select
            onChange={(event) => setRunnerKind(event.target.value as DispatchRunnerKind)}
            value={runnerKind}
          >
            <option value="codex">Codex</option>
            <option value="cursor">Cursor SDK</option>
          </select>
        </label>
        <label className="dispatch-prompt">
          <span>Dispatch Note</span>
          <textarea
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Optional note for the runner prompt"
            rows={4}
            value={prompt}
          />
        </label>
      </div>

      <dl className="dispatch-meta">
        <div>
          <dt>Status</dt>
          <dd>{currentStatus}</dd>
        </div>
        <div>
          <dt>Worktree</dt>
          <dd>{issueState?.workspace.path ?? "Created on dispatch"}</dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>{issueState?.workspace.branch ?? linearIssue?.branchName ?? "Resolved on dispatch"}</dd>
        </div>
        <div>
          <dt>Latest</dt>
          <dd>{lastResult ? `${lastResult.runnerKind} ${labelForStatus(lastResult.runner.status)}` : "No dispatch from this panel"}</dd>
        </div>
      </dl>

      <div className="dispatch-options">
        <label className="risk-check dispatch-check">
          <input
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>Confirm In Progress transition and runner dispatch.</span>
        </label>
        <label className="risk-check dispatch-check">
          <input
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
            type="checkbox"
          />
          <span>Dry-run the runner start.</span>
        </label>
        <label className="risk-check dispatch-check">
          <input
            checked={sensitiveDataConfirmed}
            onChange={(event) => setSensitiveDataConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>Allow sensitive Workpad or prompt context if intentionally included.</span>
        </label>
      </div>

      {!dispatchable ? (
        <StateNotice
          compact
          detail={`Current status is ${currentStatus}.`}
          title="Dispatch unavailable"
          tone="warning"
        />
      ) : null}
      {dispatchError ? <p className="write-error">{dispatchError}</p> : null}
      {lastResult ? (
        <p className="prompt-save-note">
          {lastResult.workspaceOperation} worktree | {lastResult.runnerKind} {labelForStatus(lastResult.runner.status)}
        </p>
      ) : null}

      <button
        className="action-button primary"
        disabled={!canDispatch}
        onClick={handleDispatch}
        type="button"
      >
        <Play size={15} />
        {isDispatching ? "Dispatching..." : "Dispatch"}
      </button>
    </section>
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

function StateNotice({
  title,
  detail,
  tone = "neutral",
  compact = false
}: {
  title: string;
  detail: string;
  tone?: Tone;
  compact?: boolean;
}) {
  return (
    <div className={`state-notice ${tone} ${compact ? "compact" : ""}`}>
      <ToneIcon tone={tone} />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function LinkedIssueRow({
  label,
  issue
}: {
  label: string;
  issue: LinearIssueReference;
}) {
  const content = (
    <>
      <div>
        <span className="acceptance-owner">{label}</span>
        <h3>{issue.identifier}</h3>
        <p>{issue.title}</p>
      </div>
      <StatusPill status={issue.status ?? "Unknown"} />
    </>
  );

  return issue.url ? (
    <a className="linked-issue-row" href={issue.url} rel="noreferrer" target="_blank">
      {content}
    </a>
  ) : (
    <article className="linked-issue-row">{content}</article>
  );
}

function LinkedIssueBoard({
  linearIssue,
  isLoading,
  apiError
}: {
  linearIssue: LinearIssueDetails | undefined;
  isLoading: boolean;
  apiError: string | undefined;
}) {
  const linkedIssues = [
    ...(linearIssue?.parent ? [{ label: "Parent", issue: linearIssue.parent }] : []),
    ...(linearIssue?.blockers ?? []).map((issue) => ({ label: "Blocks this", issue })),
    ...(linearIssue?.blockedIssues ?? []).map((issue) => ({ label: "Blocked by this", issue }))
  ];

  return (
    <section className="acceptance-board" aria-label="Linked issues">
      <div className="section-heading">
        <p className="eyebrow">Linear graph</p>
        <h2>Linked Issues</h2>
      </div>
      {isLoading ? (
        <StateNotice title="Loading linked issues" detail="Reading the selected issue through the local API." />
      ) : apiError ? (
        <StateNotice title="Linked issues unavailable" detail={apiError} tone="danger" />
      ) : linkedIssues.length > 0 ? (
        <div className="acceptance-list">
          {linkedIssues.map(({ label, issue }) => (
            <LinkedIssueRow key={`${label}-${issue.identifier}`} issue={issue} label={label} />
          ))}
        </div>
      ) : (
        <StateNotice
          title="No linked issues"
          detail="The local Linear cache has no parent, blocker, or blocked-issue links for this issue."
        />
      )}
    </section>
  );
}

function RunnerRow({ runner }: { runner: RunnerBackend }) {
  return (
    <div className={`runner-row ${classNameFor(runner.state)}`} title={runner.detail || runner.role}>
      <span className="runner-mark">
        {runner.name === "Symphony" ? <Workflow size={14} /> : runner.name === "Codex" ? <Terminal size={14} /> : <Play size={14} />}
      </span>
      <div>
        <span>{runner.name}</span>
        <p>{runner.detail || runner.role}</p>
      </div>
      <strong>
        <StatusDot status={runner.state} />
        {runner.state}
      </strong>
      <ChevronRight size={15} />
    </div>
  );
}

function CheckRow({ check }: { check: GitHubCheck }) {
  const annotations = check.annotations.slice(0, 3);
  const checkLabel = check.detailsUrl ? (
    <a href={check.detailsUrl} rel="noreferrer" target="_blank">
      {check.name}
    </a>
  ) : (
    <span>{check.name}</span>
  );

  return (
    <article className={`check-row ${classNameFor(check.state)}`}>
      <div className="check-row-main">
        <div>
          {checkLabel}
          <p>{labelForStatus(check.conclusion || check.status || check.state)}</p>
        </div>
        <strong>{labelForStatus(check.state)}</strong>
      </div>
      {annotations.length > 0 ? (
        <div className="annotation-list">
          {annotations.map((annotation, index) => (
            <p key={`${annotation.path ?? "annotation"}-${annotation.startLine ?? index}`}>
              <span>{annotation.path ?? "annotation"}{annotation.startLine ? `:${annotation.startLine}` : ""}</span>
              {annotation.message ?? annotation.title ?? "Check annotation"}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ReviewCommentRow({ comment }: { comment: GitHubReviewComment }) {
  const body = (
    <>
      <strong>{reviewCommentMeta(comment)}</strong>
      <span>{bodyPreview(comment.body)}</span>
    </>
  );

  return comment.url ? (
    <a className="review-comment-row" href={comment.url} rel="noreferrer" target="_blank">
      {body}
    </a>
  ) : (
    <div className="review-comment-row">{body}</div>
  );
}

function PullRequestPanel({
  pullRequestState,
  linearPullRequest
}: {
  pullRequestState: GitHubPullRequestApiState | undefined;
  linearPullRequest: LinearIssueDetails["pullRequests"][number] | undefined;
}) {
  const pullRequest = pullRequestState?.pullRequest;
  const fallbackLink = linearPullRequest?.url;

  if (!pullRequest) {
    return (
      <section className="inspector-section">
        <h2>GitHub PR</h2>
        <div className="review-line">
          <GitPullRequest size={16} />
          {fallbackLink ? (
            <a href={fallbackLink} rel="noreferrer" target="_blank">
              {linearPullRequest?.title ?? fallbackLink}
            </a>
          ) : (
            <span>{pullRequestState?.detail ?? "No GitHub PR data loaded"}</span>
          )}
        </div>
      </section>
    );
  }

  const failingChecks = pullRequest.checks.checks.filter((check) => check.state === "failing");
  const comments = pullRequest.reviewComments.slice(0, 4);

  return (
    <section className="inspector-section pr-section">
      <h2>GitHub PR</h2>
      <a className="pr-link" href={pullRequest.url} rel="noreferrer" target="_blank">
        #{pullRequest.number} {pullRequest.title}
      </a>
      <div className={`pr-health ${pullRequestTone(pullRequest)}`}>
        <span>{pullRequest.isDraft ? "Draft" : labelForStatus(pullRequest.state)}</span>
        <strong>{labelForStatus(pullRequest.checks.status)}</strong>
      </div>
      <dl>
        <div>
          <dt>Review</dt>
          <dd>{labelForStatus(pullRequest.reviewDecision)}</dd>
        </div>
        <div>
          <dt>Merge</dt>
          <dd>{labelForStatus(pullRequest.mergeStateStatus || pullRequest.mergeable)}</dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>{pullRequest.headRefName ?? "Unknown"} {"->"} {pullRequest.baseRefName ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Head</dt>
          <dd>{shortSha(pullRequest.headRefOid)}</dd>
        </div>
        <div>
          <dt>Matched by</dt>
          <dd>{pullRequest.matchedBy ? labelForStatus(pullRequest.matchedBy) : "Unknown"}</dd>
        </div>
      </dl>

      <div className="pr-subsection">
        <h3>Checks</h3>
        <p>
          {pullRequest.checks.passing} passing, {pullRequest.checks.pending} pending, {pullRequest.checks.failing} failing
        </p>
        {failingChecks.length > 0 ? (
          <div className="check-list">
            {failingChecks.map((check) => (
              <CheckRow key={check.id ?? check.name} check={check} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="pr-subsection">
        <h3>Latest Review Comments</h3>
        {comments.length > 0 ? (
          <div className="review-comment-list">
            {comments.map((comment, index) => (
              <ReviewCommentRow key={comment.id ?? `${comment.kind}-${index}`} comment={comment} />
            ))}
          </div>
        ) : (
          <p>No review comments found.</p>
        )}
      </div>
    </section>
  );
}

function PullRequestDiffPanel({
  pullRequestState,
  graphiteState,
  linearPullRequest,
  isLoading,
  apiError,
  stale
}: {
  pullRequestState: GitHubPullRequestApiState | undefined;
  graphiteState: GraphiteStackApiState | undefined;
  linearPullRequest: LinearIssueDetails["pullRequests"][number] | undefined;
  isLoading: boolean;
  apiError: string | undefined;
  stale: boolean;
}) {
  const pullRequest = pullRequestState?.pullRequest;
  const diff = pullRequest?.diff;
  const files = diff?.files ?? [];
  const [selectedPath, setSelectedPath] = useState<string>();

  useEffect(() => {
    if (files.length === 0) {
      setSelectedPath(undefined);
      return;
    }

    if (!selectedPath || !files.some((file) => file.path === selectedPath)) {
      setSelectedPath(files[0].path);
    }
  }, [files, selectedPath]);

  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0];
  const githubHref = pullRequest?.url ?? linearPullRequest?.url;
  const graphiteHref = graphiteState?.stack?.deepLink ?? graphiteState?.deepLink;
  let displayStatus: string = diff?.status ?? pullRequestState?.status ?? "unavailable";
  if (diff?.status === "error" || apiError) displayStatus = "error";
  if (isLoading) displayStatus = "loading";
  const summary = diff
    ? `${diff.changedFileCount} files, +${diff.additions} -${diff.deletions}`
    : pullRequestState?.detail ?? "No GitHub PR diff loaded";

  return (
    <section className="pr-diff-panel" aria-label="Pull request changed files">
      <div className="diff-panel-heading">
        <div>
          <p className="eyebrow">PR review</p>
          <h2>Changed Files</h2>
        </div>
        <div className="diff-summary">
          <StatusPill status={labelForStatus(displayStatus)} />
          <span>{summary}</span>
        </div>
      </div>

      <div className="diff-source-links">
        {githubHref ? (
          <a href={githubHref} rel="noreferrer" target="_blank">
            <GitPullRequest size={15} />
            GitHub PR
          </a>
        ) : null}
        {graphiteHref ? (
          <a href={graphiteHref} rel="noreferrer" target="_blank">
            <GitBranch size={15} />
            Graphite
          </a>
        ) : null}
      </div>

      {stale ? (
        <StateNotice
          compact
          detail="Linear issue metadata is cached and may be old; GitHub diff status is shown separately."
          title="Linear cache is stale"
          tone="warning"
        />
      ) : null}

      {isLoading ? (
        <StateNotice title="Loading PR diff" detail="Reading the resolved GitHub PR through the local API." />
      ) : apiError ? (
        <StateNotice title="Diff error" detail={apiError} tone="danger" />
      ) : !pullRequest ? (
        <StateNotice
          title="Diff unavailable"
          detail={pullRequestState?.detail ?? "Resolve a GitHub PR for this issue before local diff review is available."}
          tone={pullRequestState?.status === "not-found" ? "warning" : "danger"}
        />
      ) : !diff || diff.status === "unavailable" ? (
        <StateNotice title="Diff unavailable" detail={diff?.detail ?? "No changed-file payload was returned for this PR."} tone="warning" />
      ) : diff.status === "error" ? (
        <StateNotice title="Diff error" detail={diff.detail} tone="danger" />
      ) : diff.status === "empty" || files.length === 0 ? (
        <StateNotice title="No changed files" detail={diff.detail} />
      ) : selectedFile ? (
        <PullRequestDiffViewer
          file={selectedFile}
          files={files}
          onSelectFile={setSelectedPath}
          pullRequest={pullRequest}
        />
      ) : null}
    </section>
  );
}

function PullRequestDiffViewer({
  file,
  files,
  onSelectFile,
  pullRequest
}: {
  file: GitHubPullRequestFileDiff;
  files: GitHubPullRequestFileDiff[];
  onSelectFile: (path: string) => void;
  pullRequest: GitHubPullRequestDetails;
}) {
  const selectedComments = reviewCommentsForPath(pullRequest.reviewComments, file.path);
  const selectedAnnotations = annotationsForPath(pullRequest.checks.checks, file.path);

  return (
    <div className="diff-review-grid">
      <div className="diff-file-list" role="listbox" aria-label="Changed files">
        {files.map((candidate) => {
          const commentCount = reviewCommentsForPath(pullRequest.reviewComments, candidate.path).length;
          const annotationCount = annotationsForPath(pullRequest.checks.checks, candidate.path).length;
          return (
            <button
              className={`diff-file-row ${candidate.path === file.path ? "active" : ""}`}
              key={candidate.path}
              onClick={() => onSelectFile(candidate.path)}
              type="button"
            >
              <span>{candidate.path}</span>
              <small>
                {labelForStatus(candidate.status)} · +{candidate.additions} -{candidate.deletions}
                {commentCount + annotationCount > 0 ? ` · ${commentCount + annotationCount} notes` : ""}
              </small>
            </button>
          );
        })}
      </div>

      <div className="diff-viewer">
        <div className="diff-file-toolbar">
          <div>
            <strong>{file.path}</strong>
            {file.previousPath ? <span>{file.previousPath} {"->"} {file.path}</span> : null}
          </div>
          <div className="diff-file-metrics">
            <span>+{file.additions}</span>
            <span>-{file.deletions}</span>
          </div>
        </div>

        <div className="diff-context-strip">
          <span>{selectedComments.length} comments</span>
          <span>{selectedAnnotations.length} check notes</span>
          {file.blobUrl ? (
            <a href={file.blobUrl} rel="noreferrer" target="_blank">
              Source
            </a>
          ) : null}
        </div>

        {file.hunks.length > 0 ? (
          <div className="diff-hunks">
            {file.hunks.map((hunk) => (
              <div className="diff-hunk" key={`${file.path}-${hunk.header}`}>
                <div className="diff-hunk-header">{hunk.header}</div>
                {hunk.lines.map((line, index) => (
                  <DiffCodeLine key={`${hunk.header}-${index}`} line={line} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <StateNotice
            compact
            detail="GitHub did not return a unified patch for this file. Binary, generated, or oversized files can still appear in the changed-file list."
            title="No unified patch"
            tone="warning"
          />
        )}
      </div>
    </div>
  );
}

function DiffCodeLine({ line }: { line: GitHubPullRequestDiffLine }) {
  return (
    <div className={`diff-line ${line.type}`}>
      <span className="diff-line-number">{line.oldLineNumber ?? ""}</span>
      <span className="diff-line-number">{line.newLineNumber ?? ""}</span>
      <code>
        <span className="diff-line-marker">{diffLineMarker(line)}</span>
        {line.content || " "}
      </code>
    </div>
  );
}

function diffLineMarker(line: GitHubPullRequestDiffLine) {
  if (line.type === "addition") return "+";
  if (line.type === "deletion") return "-";
  if (line.type === "metadata") return "\\";
  return " ";
}

function reviewCommentsForPath(comments: GitHubReviewComment[], filePath: string) {
  return comments.filter((comment) => comment.path === filePath);
}

function annotationsForPath(checks: GitHubCheck[], filePath: string): GitHubCheckAnnotation[] {
  return checks.flatMap((check) => check.annotations.filter((annotation) => annotation.path === filePath));
}

function GraphiteStackPanel({
  stackState
}: {
  stackState: GraphiteStackApiState | undefined;
}) {
  const stack = stackState?.stack;
  const deepLink = stack?.deepLink ?? stackState?.deepLink;

  if (!stack) {
    return (
      <section className="inspector-section">
        <h2>Graphite Stack</h2>
        <div className="review-line">
          <GitBranch size={16} />
          {deepLink ? (
            <a href={deepLink} rel="noreferrer" target="_blank">
              {stackState?.detail ?? "Open Graphite"}
            </a>
          ) : (
            <span>{stackState?.detail ?? "No Graphite stack data loaded"}</span>
          )}
        </div>
      </section>
    );
  }

  const visibleBranches = stack.branches.filter((branch) => !branch.trunk);

  return (
    <section className="inspector-section pr-section">
      <h2>Graphite Stack</h2>
      <a className="pr-link" href={stack.deepLink} rel="noreferrer" target="_blank">
        {stack.currentBranch}
      </a>
      <div className="pr-health">
        <span>Position {stackPositionText(stack)}</span>
        <strong>{stack.submitState}</strong>
      </div>
      <dl>
        <div>
          <dt>Parent PR</dt>
          <dd>{branchDisplay(stack.parent)}</dd>
        </div>
        <div>
          <dt>Child PRs</dt>
          <dd>{branchListDisplay(stack.children)}</dd>
        </div>
        <div>
          <dt>Merge</dt>
          <dd>{stack.mergeState ?? "Unknown"}</dd>
        </div>
        <div>
          <dt>Trunk</dt>
          <dd>{stack.trunk ?? "Unknown"}</dd>
        </div>
      </dl>
      <div className="pr-subsection">
        <h3>Stack Order</h3>
        <div className="stack-list">
          {visibleBranches.map((branch) => (
            <GraphiteBranchRow key={branch.name} branch={branch} />
          ))}
        </div>
      </div>
    </section>
  );
}

function IssueFact({
  label,
  value,
  href
}: {
  label: string;
  value: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  );

  return href ? (
    <a className="issue-fact linked" href={href} rel="noreferrer" target="_blank">
      {body}
      <ExternalLink size={14} />
    </a>
  ) : (
    <div className="issue-fact">{body}</div>
  );
}

function InspectorDatum({
  label,
  value,
  icon
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="inspector-datum">
      <span>{label}</span>
      <strong>{value}</strong>
      {icon ? <span className="inspector-datum-icon">{icon}</span> : null}
    </div>
  );
}

function ReviewActionDock({
  actions,
  currentStatus,
  pendingActionId,
  disabled,
  onSelect
}: {
  actions: LinearStatusAction[];
  currentStatus: string;
  pendingActionId: string | undefined;
  disabled: boolean;
  onSelect: (action: LinearStatusAction) => void;
}) {
  const featuredActions = ["human-review", "needs-fixes", "merging", "done"]
    .map((id) => actions.find((action) => action.id === id))
    .filter((action): action is LinearStatusAction => Boolean(action));

  return (
    <div className="review-action-dock">
      {featuredActions.map((action) => {
        const isCurrent = action.stateName === currentStatus;
        const isPending = action.id === pendingActionId;
        return (
          <button
            className={`review-action-button ${isCurrent ? "current" : ""} ${isPending ? "pending" : ""}`}
            disabled={disabled}
            key={action.id}
            onClick={() => onSelect(action)}
            title={action.label}
            type="button"
          >
            {action.id === "human-review" || action.id === "done" ? <CheckCircle2 size={17} /> : <MessageCircle size={17} />}
            <span>{action.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SecurityGuardrailPanel({
  security
}: {
  security: SecurityGuardrailState | undefined;
}) {
  if (!security) {
    return (
      <section className="inspector-section security-section">
        <h2>Security</h2>
        <StateNotice
          compact
          detail="The selected issue state has not returned local permission policy yet."
          title="Guardrails pending"
          tone="warning"
        />
      </section>
    );
  }

  const riskyPolicies = security.actionPolicies.filter((policy) => (
    policy.confirmationRequired === true || policy.confirmationRequired === "action-dependent"
  ));

  return (
    <section className="inspector-section security-section">
      <h2>Security</h2>
      <StateNotice
        compact
        detail={security.detail}
        title={`Policy ${security.version}`}
        tone="success"
      />
      <div className="security-subsection">
        <h3>Credentials</h3>
        <div className="signal-list">
          {security.credentials.map((credential) => (
            <SystemSignalRow key={credential.id} signal={securityCredentialSignal(credential)} />
          ))}
        </div>
      </div>
      <div className="security-subsection">
        <h3>Risky Actions</h3>
        <div className="security-policy-list">
          {riskyPolicies.map((policy) => (
            <div className="security-policy-row" key={policy.id}>
              <span>{policy.label}</span>
              <strong>{policy.confirmationRequired === "action-dependent" ? "Per action" : "Confirm"}</strong>
              <p>{policy.detail}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="security-subsection">
        <h3>Artifacts</h3>
        <p className="security-detail">{security.artifactPolicy.detail}</p>
        <strong className="security-upload-state">
          {security.artifactPolicy.uploadsEnabled ? "Uploads available" : "Uploads blocked"}
        </strong>
      </div>
    </section>
  );
}

export function App() {
  const [selectedIssueId, setSelectedIssueId] = useState(initialSelectedIssueId);
  const [issueListState, setIssueListState] = useState<WorkflowIssueListState>();
  const [issueListError, setIssueListError] = useState<string>();
  const [isIssueListLoading, setIsIssueListLoading] = useState(false);
  const [issueState, setIssueState] = useState<WorkflowIssueState>();
  const [apiError, setApiError] = useState<string>();
  const [isIssueStateLoading, setIsIssueStateLoading] = useState(false);
  const [pendingActionId, setPendingActionId] = useState<string>();
  const [workpadNote, setWorkpadNote] = useState("");
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [sensitiveDataAccepted, setSensitiveDataAccepted] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [writeError, setWriteError] = useState<string>();
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<IssueStatus>();
  const selectedIssueState = issueState?.issue.issueId === selectedIssueId ? issueState : undefined;
  const apiIssueCards = useMemo(
    () => issueListState?.issues.map((issue) => issueCardFromLinearIssue(issue, issueListState.project.displayName)) ?? [],
    [issueListState]
  );
  const selected = useMemo(
    () => selectedIssueState
      ? issueCardFromState(selectedIssueId, selectedIssueState)
      : apiIssueCards.find((issue) => issue.id === selectedIssueId)
        ?? issueCardFromState(selectedIssueId, undefined),
    [apiIssueCards, selectedIssueId, selectedIssueState]
  );
  const linearIssue = selectedIssueState?.issue.linear;
  const sidebarIssues = useMemo(
    () => {
      const listedIssues = apiIssueCards.map((issue) => issue.id === selected.id ? selected : issue);

      if (!listedIssues.some((issue) => issue.id === selected.id)) {
        return [selected, ...listedIssues];
      }

      return listedIssues;
    },
    [apiIssueCards, selected]
  );
  const statusGroups = useMemo(
    () => Array.from(new Set([
      ...statuses,
      ...sidebarIssues
        .map((issue) => issue.status)
        .filter((status) => !statuses.includes(status))
    ])),
    [sidebarIssues]
  );
  const visibleSidebarIssues = useMemo(
    () => selectedStatusFilter
      ? sidebarIssues.filter((issue) => issue.status === selectedStatusFilter)
      : sidebarIssues,
    [selectedStatusFilter, sidebarIssues]
  );

  const refreshIssueList = useCallback(async () => {
    setIsIssueListLoading(true);
    setIssueListError(undefined);

    if (!window.workflowHub?.issues?.list) {
      setIssueListError("Desktop API unavailable in renderer preview");
      setIsIssueListLoading(false);
      return;
    }

    try {
      const state = await window.workflowHub.issues.list();
      setIssueListState(state);
      setIssueListError(undefined);
    } catch (error: unknown) {
      setIssueListError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsIssueListLoading(false);
    }
  }, []);

  const refreshIssueState = useCallback(async () => {
    setIssueState(undefined);
    setApiError(undefined);
    setIsIssueStateLoading(true);

    if (!window.workflowHub?.issues?.getState) {
      setApiError("Desktop API unavailable in renderer preview");
      setIsIssueStateLoading(false);
      return;
    }

    try {
      const state = await window.workflowHub.issues.getState(selectedIssueId);
      setIssueState(state);
      setApiError(undefined);
    } catch (error: unknown) {
      setApiError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsIssueStateLoading(false);
    }
  }, [selectedIssueId]);

  useEffect(() => {
    void refreshIssueList();
  }, [refreshIssueList]);

  useEffect(() => {
    void refreshIssueState();
  }, [refreshIssueState]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("issue") === selectedIssueId) return;
    url.searchParams.set("issue", selectedIssueId);
    window.history.replaceState(null, "", url.toString());
  }, [selectedIssueId]);

  useEffect(() => {
    if (selectedStatusFilter && !statusGroups.includes(selectedStatusFilter)) {
      setSelectedStatusFilter(undefined);
    }
  }, [selectedStatusFilter, statusGroups]);

  const handleSelectIssue = useCallback((issueId: string) => {
    setSelectedIssueId(issueId.toUpperCase());
  }, []);

  const refreshDashboard = useCallback(async () => {
    await Promise.all([refreshIssueList(), refreshIssueState()]);
  }, [refreshIssueList, refreshIssueState]);

  const workspacePath = selectedIssueState?.workspace.found ? selectedIssueState.workspace.path : selected.worktree;
  const branch = selectedIssueState?.workspace.found ? selectedIssueState.workspace.branch : selected.branch;
  const displayTitle = linearIssue?.title ?? selected.title;
  const displayStatus = linearIssue?.status ?? selected.status;
  const displayProject = selectedIssueState?.project.displayName ?? issueListState?.project.displayName ?? selected.repo;
  const issueCountLabel = issueListState
    ? `${issueListState.issues.length} issues`
    : isIssueListLoading
      ? "Loading issues"
      : "Issue list offline";
  const platformLabel = window.workflowHub
    ? `${window.workflowHub.platform} / ${window.workflowHub.version}`
    : "browser preview";
  const sourceSignals = useMemo(
    () => selectedIssueState ? selectedIssueState.adapters.map(signalFromAdapter) : systemSignals,
    [selectedIssueState]
  );
  const visibleRunners = useMemo(
    () => selectedIssueState ? selectedIssueState.runners.map(runnerFromApiState) : runnerBackends,
    [selectedIssueState]
  );
  const pullRequestState = gitHubPullRequestState(selectedIssueState?.pullRequests);
  const graphiteState = graphiteStackState(selectedIssueState?.pullRequests);
  const reviewState = selectedIssueState?.reviews[0];
  const linearPullRequest = linearIssue?.pullRequests[0];
  const linearActions = selectedIssueState?.linearStatusActions ?? fallbackLinearActions;
  const pendingAction = linearActions.find((action) => action.id === pendingActionId);
  const localTimeline = useMemo(
    () => {
      if (selectedIssueState?.runTimeline?.length) {
        return selectedIssueState.runTimeline.slice().reverse().map(timelineFromRunnerTimelineEntry);
      }

      return selectedIssueState?.issue.events?.slice().reverse().map(timelineFromWorkflowEvent) ?? [];
    },
    [selectedIssueState]
  );
  const visibleTimeline = localTimeline;
  const selectedCache = selectedIssueState?.issue.linear?.cache ?? selectedIssueState?.issue.cache;
  const listCache = issueListState?.cache;
  const dashboardNotice = isIssueStateLoading || isIssueListLoading
    ? {
        title: "Loading local API data",
        detail: "Reading Linear cache, workspace state, runner state, and PR providers.",
        tone: "neutral" as Tone
      }
    : apiError
      ? {
          title: "Selected issue error",
          detail: apiError,
          tone: "danger" as Tone
        }
      : issueListError
        ? {
            title: issueListState ? "Issue list stale" : "Issue list error",
            detail: issueListError,
            tone: issueListState ? "warning" as Tone : "danger" as Tone
          }
        : selectedCache?.stale
          ? {
              title: "Selected issue cache is stale",
              detail: cacheNoticeDetail(selectedCache, selectedIssueState?.issue.adapter),
              tone: toneForCache(selectedCache),
              compact: true
            }
          : listCache?.stale
            ? {
                title: "Issue list cache is stale",
                detail: cacheNoticeDetail(listCache, issueListState?.adapter),
                tone: toneForCache(listCache),
                compact: true
              }
            : undefined;

  const handleSelectLinearAction = (action: LinearStatusAction) => {
    setPendingActionId(action.id);
    setWorkpadNote("");
    setRiskAccepted(false);
    setSensitiveDataAccepted(false);
    setWriteError(undefined);
  };

  const handleApplyLinearAction = async () => {
    if (!pendingAction || !window.workflowHub?.issues?.applyAction) return;

    setIsWriting(true);
    setWriteError(undefined);
    try {
      await window.workflowHub.issues.applyAction({
        issueId: selected.id,
        actionId: pendingAction.id,
        confirmed: true,
        sensitiveDataConfirmed: sensitiveDataAccepted,
        note: workpadNote.trim() || undefined
      });
      setPendingActionId(undefined);
      setWorkpadNote("");
      setRiskAccepted(false);
      setSensitiveDataAccepted(false);
      await refreshDashboard();
    } catch (error: unknown) {
      setWriteError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWriting(false);
    }
  };

  const primaryPullRequest = pullRequestState?.pullRequest;
  const prHref = primaryPullRequest?.url ?? linearPullRequest?.url;
  const prLabel = primaryPullRequest
    ? `#${primaryPullRequest.number}`
    : linearPullRequest?.number
      ? `#${linearPullRequest.number}`
      : labelForStatus(pullRequestState?.status ?? "not-found");
  const reviewSummary = reviewLabel(reviewState)
    ?? (primaryPullRequest ? labelForStatus(primaryPullRequest.reviewDecision) : pullRequestLabel(pullRequestState));
  const runnerSummary = selectedIssueState?.symphony?.selectedIssue
    ? `Symphony ${labelForStatus(selectedIssueState.symphony.selectedIssue.normalizedState)}`
    : visibleRunners.map((runner) => `${runner.name} ${runner.state}`).join(" | ");
  const updatedLabel = linearIssue?.updatedAt ? formatTimestamp(linearIssue.updatedAt) : selected.lastEvent;
  const timelineCount = visibleTimeline.length;
  const checkCount = primaryPullRequest?.checks.total ?? 0;
  const diffFileCount = primaryPullRequest?.diff?.changedFileCount ?? 0;
  const commitLabel = selectedIssueState?.workspace.headSha ? shortSha(selectedIssueState.workspace.headSha) : "Unknown";

  return (
    <main className="app-shell">
      <div className="cockpit-grid">
        <nav className="rail" aria-label="Primary">
          <div className="brand-mark" aria-label="Workflow Hub">
            <Workflow size={25} />
          </div>
          <button className="rail-button active" title="Issues" type="button">
            <LayoutGrid size={20} />
          </button>
          <button className="rail-button" title="Branches" type="button">
            <GitFork size={20} />
          </button>
          <button className="rail-button" title="Runs" type="button">
            <Play size={20} />
          </button>
          <button className="rail-button" title="History" type="button">
            <History size={20} />
          </button>
          <button className="rail-button" title="Registry" type="button">
            <Box size={20} />
          </button>
          <button className="rail-button" title="Terminal" type="button">
            <Terminal size={20} />
          </button>
          <button className="rail-button rail-settings" title="Settings" type="button">
            <PanelRight size={20} />
          </button>
        </nav>

        <aside className="sidebar">
          <header className="sidebar-header">
            <div>
              <p className="eyebrow">Issues</p>
              <h1>{displayProject}</h1>
            </div>
            <div className="header-tools">
              <button className="icon-button" title="Filter states" type="button">
                <SlidersHorizontal size={18} />
              </button>
              <button className="icon-button" title="Draft issue" type="button">
                <SquarePen size={18} />
              </button>
            </div>
          </header>

          <section className="state-groups" aria-label="Issue states">
            {isIssueListLoading && !issueListState ? (
              <StateNotice title="Loading issues" detail="Reading the Workflow Hub project list from the local API." />
            ) : issueListError && !issueListState ? (
              <StateNotice title="Issue list unavailable" detail={issueListError} tone="danger" />
            ) : sidebarIssues.length === 0 ? (
              <StateNotice
                title="No issues cached"
                detail="Run a Linear sync or refresh once credentials are available."
                tone="warning"
              />
            ) : (
              statusGroups
                .filter((status) => selectedStatusFilter === status || sidebarIssues.some((issue) => issue.status === status))
                .map((status) => {
                  const issues = sidebarIssues.filter((issue) => issue.status === status);
                  const isActive = selectedStatusFilter === status;
                  return (
                    <IssueStateGroup
                      active={isActive}
                      issues={issues}
                      key={status}
                      onSelect={handleSelectIssue}
                      onToggle={() => setSelectedStatusFilter((current) => current === status ? undefined : status)}
                      selectedIssueId={selected.id}
                      status={status}
                    />
                  );
                })
            )}
          </section>
        </aside>

        <section className="workspace">
          <header className="workspace-header">
            <div>
              <p className="eyebrow">Workflow Hub</p>
              <h2>Issue Workspace</h2>
            </div>
            <div className="header-metrics" aria-label="Track progress">
              <span>{issueCountLabel}</span>
              <span>{selectedCache ? cacheStatusText(selectedCache) : "Cache pending"}</span>
              <StatusPill status={displayStatus} />
            </div>
          </header>

          <section className="workspace-content">
            {dashboardNotice ? (
              <StateNotice
                compact={dashboardNotice.compact}
                detail={dashboardNotice.detail}
                title={dashboardNotice.title}
                tone={dashboardNotice.tone}
              />
            ) : null}

            <section className="selected-issue-workspace" aria-label="Selected issue workspace">
              <div className="selected-issue-head">
                <div>
                  <div className="selected-issue-kicker">
                    <strong>{selected.id}</strong>
                    <StatusPill status={displayStatus} />
                  </div>
                  <h3>{displayTitle}</h3>
                </div>
                <button
                  className="icon-button"
                  disabled={isIssueListLoading || isIssueStateLoading}
                  onClick={() => void refreshDashboard()}
                  title="Refresh local state"
                  type="button"
                >
                  <RotateCw size={18} />
                </button>
              </div>

              <div className="primary-actions" aria-label="Issue actions">
                <ActionButton disabled icon={<FolderOpen size={17} />} label="Open Zed" />
                <ActionButton
                  disabled={reviewState?.status !== "available"}
                  icon={<Play size={17} />}
                  label="Run Simulator"
                  primary={reviewState?.status === "available"}
                />
                <ActionButton disabled icon={<Smartphone size={17} />} label="Run Device" />
                <ActionButton
                  disabled={!prHref}
                  href={prHref}
                  icon={<GitPullRequest size={17} />}
                  label="Show PR"
                />
              </div>

              <div className="issue-fact-grid">
                <IssueFact label="Worktree" value={workspacePath ?? "Not found"} />
                <IssueFact label="Branch" value={branch ?? "Unknown"} />
                <IssueFact href={prHref} label="PR" value={prLabel} />
                <IssueFact label="Review" value={reviewSummary} />
                <IssueFact label="Runner" value={runnerSummary || "No runner state"} />
                <IssueFact label="Updated" value={updatedLabel} />
              </div>

              <div className="issue-tabbar" aria-label="Issue views">
                <button className="active" type="button">Timeline <span>{timelineCount}</span></button>
                <button type="button">Files <span>{diffFileCount}</span></button>
                <button type="button">Checks <span>{checkCount}</span></button>
                <button type="button">Commit <span>{commitLabel}</span></button>
              </div>

              <PullRequestDiffPanel
                apiError={apiError}
                graphiteState={graphiteState}
                isLoading={isIssueStateLoading}
                linearPullRequest={linearPullRequest}
                pullRequestState={pullRequestState}
                stale={Boolean(selectedCache?.stale)}
              />

              <section className="conversation cockpit-timeline" aria-label="Timeline">
                {isIssueStateLoading ? (
                  <StateNotice title="Loading timeline" detail="Reading runner and workflow events for the selected issue." />
                ) : apiError ? (
                  <StateNotice title="Timeline unavailable" detail={apiError} tone="danger" />
                ) : visibleTimeline.length > 0 ? (
                  visibleTimeline.map((event) => (
                    <TimelineRow key={event.id} event={event} />
                  ))
                ) : (
                  <StateNotice
                    title="No timeline events"
                    detail="No runner, Linear write, or review prompt events are recorded for this issue yet."
                  />
                )}
              </section>
            </section>

            <section className="workspace-lower" aria-label="Workflow controls">
              <LinearActionBoard
                actions={linearActions}
                currentStatus={displayStatus}
                disabled={isWriting || !window.workflowHub?.issues?.applyAction}
                onSelect={handleSelectLinearAction}
                pendingActionId={pendingActionId}
              />

              {pendingAction ? (
                <ConfirmationBoundary
                  action={pendingAction}
                  currentStatus={displayStatus}
                  isWriting={isWriting}
                  issueId={selected.id}
                  note={workpadNote}
                  onApply={handleApplyLinearAction}
                  onCancel={() => {
                    setPendingActionId(undefined);
                    setWorkpadNote("");
                    setRiskAccepted(false);
                    setSensitiveDataAccepted(false);
                    setWriteError(undefined);
                  }}
                  onNoteChange={setWorkpadNote}
                  onRiskAcceptedChange={setRiskAccepted}
                  onSensitiveDataAcceptedChange={setSensitiveDataAccepted}
                  riskAccepted={riskAccepted}
                  sensitiveDataAccepted={sensitiveDataAccepted}
                  writeError={writeError}
                />
              ) : null}

              <ReadyDispatchPanel
                issueId={selected.id}
                issueState={selectedIssueState}
                onFinished={refreshDashboard}
              />

              <FixPromptPanel
                issueId={selected.id}
                issueState={selectedIssueState}
                onSaved={refreshIssueState}
                pullRequestState={pullRequestState}
              />

              <div className="runner-workbench">
                <CodexRunPanel
                  issueId={selected.id}
                  issueState={selectedIssueState}
                  onFinished={refreshIssueState}
                />

                <CursorRunPanel
                  issueId={selected.id}
                  issueState={selectedIssueState}
                  onFinished={refreshIssueState}
                />
              </div>

              <LinkedIssueBoard
                apiError={apiError}
                isLoading={isIssueStateLoading}
                linearIssue={linearIssue}
              />

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
            </section>
          </section>
        </section>

        <aside className="inspector">
          <header className="inspector-tabs" aria-label="Inspector views">
            <button className="active" type="button">Workspace</button>
            <button type="button">Runners</button>
            <button type="button">Review</button>
          </header>

          <section className="inspector-section workspace-inspector">
            <h2>Workspace</h2>
            <div className="inspector-data-list">
              <InspectorDatum icon={<FolderOpen size={16} />} label="Path" value={workspacePath ?? "Not found"} />
              <InspectorDatum icon={<Copy size={16} />} label="Branch" value={branch ?? "Unknown"} />
              <InspectorDatum label="Base" value={selectedIssueState?.project.canonicalBranch ?? "main"} />
              <InspectorDatum icon={<ExternalLink size={16} />} label="PR" value={prLabel} />
              <InspectorDatum label="Status" value={<StatusPill status={displayStatus} />} />
              <InspectorDatum label="Updated" value={updatedLabel} />
              <InspectorDatum label="Bridge" value={platformLabel} />
            </div>
          </section>

          <section className="inspector-section">
            <h2>Runners</h2>
            <div className="runner-list">
              {visibleRunners.map((runner) => (
                <RunnerRow key={runner.name} runner={runner} />
              ))}
            </div>
          </section>

          <section className="inspector-section review-inspector">
            <h2>Review</h2>
            <ReviewActionDock
              actions={linearActions}
              currentStatus={displayStatus}
              disabled={isWriting || !window.workflowHub?.issues?.applyAction}
              onSelect={handleSelectLinearAction}
              pendingActionId={pendingActionId}
            />
            <div className="review-line">
              <Workflow size={16} />
              <span>{reviewSummary}</span>
            </div>
          </section>

          <SecurityGuardrailPanel security={selectedIssueState?.security} />

          <PullRequestPanel pullRequestState={pullRequestState} linearPullRequest={linearPullRequest} />
          <GraphiteStackPanel stackState={graphiteState} />

          <section className="inspector-section">
            <h2>Linear</h2>
            <dl>
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
                <dd>{cacheText(selectedIssueState)}</dd>
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
        </aside>
      </div>

      <footer className="command-bar">
        <div className="command-prompt">
          <kbd>Cmd K</kbd>
          <span>{selected.id}: ask, dispatch, review</span>
          <Send size={18} />
        </div>
        <button className="command-tool" disabled title="Runner queue" type="button">
          <GitFork size={18} />
        </button>
        <button className="command-tool" disabled title="Prompt tools" type="button">
          <Sparkles size={18} />
        </button>
        <button className="command-tool" disabled title="Terminal" type="button">
          <Terminal size={18} />
        </button>
      </footer>
    </main>
  );
}
