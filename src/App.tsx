import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Command,
  Database,
  FileText,
  GitBranch,
  GitPullRequest,
  Laptop,
  MessageSquareText,
  Play,
  RotateCw,
  Save,
  ShieldAlert,
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
  CursorRunResult,
  GitHubCheck,
  GitHubPullRequestApiState,
  GitHubPullRequestDetails,
  GitHubReviewComment,
  GraphiteStackApiState,
  GraphiteStackBranch,
  LinearIssueDetails,
  LinearStatusAction,
  PullRequestApiState,
  ReviewFixPromptDraft,
  ReviewApiState,
  RunnerApiState,
  WorkflowEvent,
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
  return {
    name: runner.kind,
    role: runner.role,
    state: runner.latestRun ? labelForStatus(runner.latestRun.status) : labelForStatus(runner.status),
    detail: runner.detail
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

function workpadText(linearIssue: LinearIssueDetails | undefined) {
  if (!linearIssue?.codexWorkpad) return "Not found";
  return linearIssue.codexWorkpad.updatedAt
    ? `Updated ${formatTimestamp(linearIssue.codexWorkpad.updatedAt)}`
    : "Found";
}

function cacheText(issueState: WorkflowIssueState | undefined) {
  const cache = issueState?.issue.linear?.cache ?? issueState?.issue.cache;
  if (!cache) return issueState?.issue.adapter.detail ?? "Waiting for Linear";

  if (cache.status === "stale") return "Stale";
  return cache.stale ? `${labelForStatus(cache.status)} stale` : labelForStatus(cache.status);
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
  if (/failed|error/i.test(event.type)) return "danger";
  if (/blocked|needs-fixes/i.test(String(event.payload.nextStatus ?? event.message))) return "warning";
  return "success";
}

function timelineFromWorkflowEvent(event: WorkflowEvent): TimelineEvent {
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

function initialSelectedIssueId() {
  const params = new URLSearchParams(window.location.search);
  const requestedIssueId = params.get("issue")?.toUpperCase();
  return requestedIssueId && /^[a-z]+-\d+$/i.test(requestedIssueId)
    ? requestedIssueId
    : issues[0].id;
}

function hasStaticIssue(issueId: string) {
  return issues.some((issue) => issue.id === issueId);
}

function issueCardFromState(issueId: string, issueState: WorkflowIssueState | undefined): IssueCard {
  const linearIssue = issueState?.issue.linear;
  const workspace = issueState?.workspace;
  const pullRequestState = gitHubPullRequestState(issueState?.pullRequests);
  const summary = pullRequestState?.detail
    ?? workspace?.adapter.detail
    ?? issueState?.issue.adapter.detail
    ?? "Dynamic issue loaded from the local workflow API.";

  return {
    id: issueId,
    title: linearIssue?.title ?? "Loading issue state",
    repo: issueState?.project.displayName ?? "workflow-hub",
    status: issueStatusFromLinear(linearIssue?.status, "Backlog"),
    runner: "Codex",
    branch: workspace?.branch ?? "Resolving branch",
    worktree: workspace?.path ?? "Resolving issue workspace",
    pr: pullRequestState?.pullRequest
      ? `#${pullRequestState.pullRequest.number} ${pullRequestState.pullRequest.title}`
      : undefined,
    lastEvent: pullRequestState?.detail ?? issueState?.issue.adapter.detail ?? "Loading local API state",
    buildTarget: "None",
    risk: "medium",
    phase: "Workflow Visibility",
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
  writeError,
  isWriting,
  onNoteChange,
  onRiskAcceptedChange,
  onCancel,
  onApply
}: {
  action: LinearStatusAction;
  issueId: string;
  currentStatus: string;
  note: string;
  riskAccepted: boolean;
  writeError: string | undefined;
  isWriting: boolean;
  onNoteChange: (value: string) => void;
  onRiskAcceptedChange: (value: boolean) => void;
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
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
  const [lastResult, setLastResult] = useState<CursorRunResult>();
  const latestRun = cursorRunner?.latestRun;
  const canRun = Boolean(
    window.workflowHub?.issues?.startCursorRun
    && issueState?.workspace.found
    && prompt.trim().length > 0
    && model.trim().length > 0
    && !isRunning
  );

  useEffect(() => {
    setModel(defaultModel);
    setPrompt("");
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
        model
      });
      setLastResult(result);
      setPrompt("");
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
        <p>{runner.detail || runner.role}</p>
      </div>
      <strong>{runner.state}</strong>
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

export function App() {
  const [selectedIssueId, setSelectedIssueId] = useState(initialSelectedIssueId);
  const [issueState, setIssueState] = useState<WorkflowIssueState>();
  const [apiError, setApiError] = useState<string>();
  const [dynamicIssueIds, setDynamicIssueIds] = useState<string[]>(() => {
    const initialIssueId = initialSelectedIssueId();
    return hasStaticIssue(initialIssueId) ? [] : [initialIssueId];
  });
  const [dynamicIssueCards, setDynamicIssueCards] = useState<Record<string, IssueCard>>({});
  const [pendingActionId, setPendingActionId] = useState<string>();
  const [workpadNote, setWorkpadNote] = useState("");
  const [riskAccepted, setRiskAccepted] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [writeError, setWriteError] = useState<string>();
  const selectedIssueState = issueState?.issue.issueId === selectedIssueId ? issueState : undefined;
  const selected = useMemo(
    () => issues.find((issue) => issue.id === selectedIssueId)
      ?? (selectedIssueState
        ? issueCardFromState(selectedIssueId, selectedIssueState)
        : dynamicIssueCards[selectedIssueId] ?? issueCardFromState(selectedIssueId, undefined)),
    [dynamicIssueCards, selectedIssueId, selectedIssueState]
  );
  const linearIssue = selectedIssueState?.issue.linear;
  const sidebarIssues = useMemo(
    () => {
      const dynamicIssues = dynamicIssueIds
        .filter((issueId) => !hasStaticIssue(issueId))
        .map((issueId) => issueId === selected.id
          ? selected
          : dynamicIssueCards[issueId] ?? issueCardFromState(issueId, undefined));
      const listedIssues = [...dynamicIssues, ...issues];

      return listedIssues.map((issue) => {
        if (issue.id !== selected.id || !linearIssue) return issue;

        return {
          ...issue,
          title: linearIssue.title,
          status: issueStatusFromLinear(linearIssue.status, issue.status),
          pr: linearIssue.pullRequests[0]?.title ?? issue.pr
        };
      });
    },
    [dynamicIssueCards, dynamicIssueIds, linearIssue, selected]
  );

  const refreshIssueState = useCallback(async () => {
    setIssueState(undefined);
    setApiError(undefined);

    if (!window.workflowHub?.issues?.getState) {
      setApiError("Desktop API unavailable in renderer preview");
      return;
    }

    try {
      const state = await window.workflowHub.issues.getState(selectedIssueId);
      setIssueState(state);
      setApiError(undefined);
    } catch (error: unknown) {
      setApiError(error instanceof Error ? error.message : String(error));
    }
  }, [selectedIssueId]);

  useEffect(() => {
    void refreshIssueState();
  }, [refreshIssueState]);

  useEffect(() => {
    if (hasStaticIssue(selectedIssueId) || !selectedIssueState) return;
    setDynamicIssueCards((current) => ({
      ...current,
      [selectedIssueId]: issueCardFromState(selectedIssueId, selectedIssueState)
    }));
  }, [selectedIssueId, selectedIssueState]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("issue") === selectedIssueId) return;
    url.searchParams.set("issue", selectedIssueId);
    window.history.replaceState(null, "", url.toString());
  }, [selectedIssueId]);

  const handleSelectIssue = useCallback((issueId: string) => {
    const normalizedIssueId = issueId.toUpperCase();
    if (!hasStaticIssue(normalizedIssueId)) {
      setDynamicIssueIds((current) => current.includes(normalizedIssueId)
        ? current
        : [normalizedIssueId, ...current]);
    }
    setSelectedIssueId(normalizedIssueId);
  }, []);

  const workspacePath = selectedIssueState?.workspace.found ? selectedIssueState.workspace.path : selected.worktree;
  const branch = selectedIssueState?.workspace.found ? selectedIssueState.workspace.branch : selected.branch;
  const displayTitle = linearIssue?.title ?? selected.title;
  const displayStatus = linearIssue?.status ?? selected.status;
  const displayProject = selectedIssueState?.project.displayName ?? selected.repo;
  const doneCount = useMemo(
    () => acceptanceCriteria.filter((criterion) => criterion.status === "Done").length,
    []
  );
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
    () => selectedIssueState?.issue.events?.slice().reverse().map(timelineFromWorkflowEvent) ?? [],
    [selectedIssueState]
  );
  const visibleTimeline = localTimeline.length > 0 ? [...localTimeline, ...timeline] : timeline;

  const handleSelectLinearAction = (action: LinearStatusAction) => {
    setPendingActionId(action.id);
    setWorkpadNote("");
    setRiskAccepted(false);
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
        note: workpadNote.trim() || undefined
      });
      setPendingActionId(undefined);
      setWorkpadNote("");
      setRiskAccepted(false);
      await refreshIssueState();
    } catch (error: unknown) {
      setWriteError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWriting(false);
    }
  };

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
            const count = sidebarIssues.filter((issue) => issue.status === status).length;
            return (
              <button key={status} className="state-row" type="button">
                <span>{status}</span>
                <strong>{count}</strong>
              </button>
            );
          })}
        </section>

        <section className="issue-list" aria-label="Issues">
          {sidebarIssues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              active={issue.id === selected.id}
              onSelect={handleSelectIssue}
            />
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
          <ResolutionPanel selectedIssue={selected} issueState={selectedIssueState} apiError={apiError} />

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
                setWriteError(undefined);
              }}
              onNoteChange={setWorkpadNote}
              onRiskAcceptedChange={setRiskAccepted}
              riskAccepted={riskAccepted}
              writeError={writeError}
            />
          ) : null}

          <FixPromptPanel
            issueId={selected.id}
            issueState={selectedIssueState}
            onSaved={refreshIssueState}
            pullRequestState={pullRequestState}
          />

          <CursorRunPanel
            issueId={selected.id}
            issueState={selectedIssueState}
            onFinished={refreshIssueState}
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
            {visibleTimeline.map((event) => (
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
              <dd>{linearIssue?.status ?? labelForStatus(selectedIssueState?.issue.status ?? "loading")}</dd>
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

        <section className="inspector-section">
          <h2>Runners</h2>
          {visibleRunners.map((runner) => (
            <RunnerRow key={runner.name} runner={runner} />
          ))}
        </section>

        <PullRequestPanel pullRequestState={pullRequestState} linearPullRequest={linearPullRequest} />
        <GraphiteStackPanel stackState={graphiteState} />

        <section className="inspector-section">
          <h2>Review Controls</h2>
          <div className="review-line">
            <Workflow size={16} />
            <span>{reviewLabel(reviewState) ?? selected.lastEvent ?? pullRequestLabel(pullRequestState)}</span>
          </div>
        </section>
      </aside>
    </main>
  );
}
