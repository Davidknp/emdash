import crypto from 'node:crypto';
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { isValidProviderId, type AgentProviderId } from '@shared/agent-provider-registry';
import {
  TRIGGER_INTEGRATION_MAP,
  type Automation,
  type AutomationMode,
  type AutomationRunLog,
  type AutomationSchedule,
  type CreateAutomationInput,
  type DayOfWeek,
  type ScheduleType,
  type TriggerConfig,
  type TriggerType,
  type UpdateAutomationInput,
} from '@shared/automations/types';
import { agentSessionExitedChannel } from '@shared/events/agentEvents';
import { automationRunStatusChannel } from '@shared/events/automationEvents';
import { bareRefName } from '@shared/git-utils';
import type { Issue } from '@shared/tasks';
import { getIssueProvider } from '@main/core/issues/registry';
import { getProjectById } from '@main/core/projects/operations/getProjects';
import { createTask } from '@main/core/tasks/createTask';
import { db } from '@main/db/client';
import {
  automationRunLogs as automationRunLogsTable,
  automations as automationsTable,
  type AutomationRow,
  type AutomationRunLogRow,
} from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';

// ---------------------------------------------------------------------------
// RawEvent shape returned by fetchers
// ---------------------------------------------------------------------------

interface RawEvent {
  id: string;
  title: string;
  url?: string;
  type: string;
  extra?: string;
  labels?: string[];
  branch?: string;
  assignee?: string;
  identifier?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// AsyncMutex — promise-chaining based mutex
// ---------------------------------------------------------------------------

class AsyncMutex {
  private chain: Promise<void> = Promise.resolve();

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.chain = this.chain.then(async () => {
        try {
          resolve(await fn());
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}

const dataMutex = new AsyncMutex();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_ORDER: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const VALID_SCHEDULE_TYPES: ScheduleType[] = ['hourly', 'daily', 'weekly', 'monthly'];
const VALID_AUTOMATION_STATUS: Automation['status'][] = ['active', 'paused', 'error'];
const VALID_RUN_STATUS: AutomationRunLog['status'][] = ['running', 'success', 'failure'];

const MAX_RUNS_PER_AUTOMATION = 100;
const MAX_TOTAL_RUNS = 2000;
const DEFAULT_MAX_RUN_DURATION_MS = 2 * 60 * 60 * 1000; // 2h
const SCHEDULER_TICK_MS = 30_000;
const TRIGGER_TICK_MS = 60_000;

// ---------------------------------------------------------------------------
// Validation + helpers
// ---------------------------------------------------------------------------

function validateSchedule(schedule: AutomationSchedule): void {
  if (!VALID_SCHEDULE_TYPES.includes(schedule.type)) {
    throw new Error(`Invalid schedule type: ${schedule.type}`);
  }
  if (schedule.hour !== undefined && (schedule.hour < 0 || schedule.hour > 23)) {
    throw new Error(`Invalid hour: ${schedule.hour} (must be 0-23)`);
  }
  if (schedule.minute !== undefined && (schedule.minute < 0 || schedule.minute > 59)) {
    throw new Error(`Invalid minute: ${schedule.minute} (must be 0-59)`);
  }
  if (schedule.type === 'weekly' && schedule.dayOfWeek && !DAY_ORDER.includes(schedule.dayOfWeek)) {
    throw new Error(`Invalid dayOfWeek: ${schedule.dayOfWeek}`);
  }
  if (schedule.type === 'monthly') {
    const dom = schedule.dayOfMonth ?? 1;
    if (dom < 1 || dom > 31) {
      throw new Error(`Invalid dayOfMonth: ${dom} (must be 1-31)`);
    }
  }
}

function computeNextRun(schedule: AutomationSchedule, fromDate?: Date): string {
  const now = fromDate ?? new Date();
  const next = new Date(now);
  const hour = schedule.hour ?? 0;
  const minute = schedule.minute ?? 0;

  switch (schedule.type) {
    case 'hourly': {
      next.setMinutes(minute, 0, 0);
      if (next <= now) next.setHours(next.getHours() + 1);
      break;
    }
    case 'daily': {
      next.setHours(hour, minute, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      break;
    }
    case 'weekly': {
      const targetDay = DAY_ORDER.indexOf(schedule.dayOfWeek ?? 'mon');
      const currentDay = next.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0) {
        next.setHours(hour, minute, 0, 0);
        if (next <= now) daysUntil = 7;
      }
      if (daysUntil > 0) next.setDate(next.getDate() + daysUntil);
      next.setHours(hour, minute, 0, 0);
      break;
    }
    case 'monthly': {
      const desired = schedule.dayOfMonth ?? 1;
      const daysInCurrent = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(desired, daysInCurrent));
      next.setHours(hour, minute, 0, 0);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
        const daysInNext = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(desired, daysInNext));
        next.setHours(hour, minute, 0, 0);
      }
      break;
    }
  }

  return next.toISOString();
}

function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function normalizeAutomationStatus(value: unknown): Automation['status'] {
  if (
    typeof value === 'string' &&
    VALID_AUTOMATION_STATUS.includes(value as Automation['status'])
  ) {
    return value as Automation['status'];
  }
  return 'active';
}

function normalizeRunStatus(value: unknown): AutomationRunLog['status'] {
  if (typeof value === 'string' && VALID_RUN_STATUS.includes(value as AutomationRunLog['status'])) {
    return value as AutomationRunLog['status'];
  }
  return 'running';
}

function normalizeMode(value: unknown): AutomationMode {
  return value === 'trigger' ? 'trigger' : 'schedule';
}

function normalizeTriggerType(value: unknown): TriggerType | null {
  if (typeof value === 'string' && value in TRIGGER_INTEGRATION_MAP) {
    return value as TriggerType;
  }
  return null;
}

function serializeSchedule(schedule: AutomationSchedule): string {
  return JSON.stringify(schedule);
}

function deserializeSchedule(serialized: string): AutomationSchedule {
  const parsed = JSON.parse(serialized) as AutomationSchedule;
  validateSchedule(parsed);
  return parsed;
}

function serializeTriggerConfig(config: TriggerConfig | null | undefined): string | null {
  if (!config) return null;
  return JSON.stringify(config);
}

function deserializeTriggerConfig(serialized: string | null): TriggerConfig | null {
  if (!serialized) return null;
  try {
    return JSON.parse(serialized) as TriggerConfig;
  } catch {
    return null;
  }
}

function mapAutomationRow(row: AutomationRow): Automation {
  return {
    id: row.id,
    name: row.name,
    projectId: row.projectId,
    projectName: row.projectName,
    prompt: row.prompt,
    agentId: row.agentId,
    mode: normalizeMode(row.mode),
    schedule: deserializeSchedule(row.schedule),
    triggerType: normalizeTriggerType(row.triggerType),
    triggerConfig: deserializeTriggerConfig(row.triggerConfig),
    useWorktree: row.useWorktree === 1,
    status: normalizeAutomationStatus(row.status),
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    runCount: row.runCount,
    lastRunResult:
      row.lastRunResult === 'success' || row.lastRunResult === 'failure' ? row.lastRunResult : null,
    lastRunError: row.lastRunError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRunRow(row: AutomationRunLogRow): AutomationRunLog {
  return {
    id: row.id,
    automationId: row.automationId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    status: normalizeRunStatus(row.status),
    error: row.error,
    taskId: row.taskId,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type PendingRun = {
  automationId: string;
  runLogId: string;
  taskId: string;
};

class AutomationsService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private triggerTimer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private triggerTicking = false;
  private reconciling = false;
  private started = false;

  /** Tracks the last-known event IDs per automation to detect new ones. */
  private knownEventIds = new Map<string, Set<string>>();

  /** Automations with an in-flight run — prevents schedule overlap. */
  private inFlightRuns = new Set<string>();

  /** Pending runs keyed by taskId — used to finalize run logs on agent exit. */
  private pendingRunsByTaskId = new Map<string, PendingRun>();

  /** Unsubscribe function for the agent session exited event bus. */
  private agentExitUnsub: (() => void) | null = null;

  // -------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------

  start(): void {
    if (this.started) return;
    this.started = true;
    log.info('[Automations] Service starting');

    this.agentExitUnsub = events.on(agentSessionExitedChannel, (payload) => {
      void this.handleAgentSessionExited(payload.taskId, payload.exitCode);
    });

    this.timer = setInterval(() => void this.tick(), SCHEDULER_TICK_MS);
    this.triggerTimer = setInterval(() => void this.tickTriggers(), TRIGGER_TICK_MS);

    // First-pass: reconcile missed runs, then do an immediate tick
    void this.reconcileMissedRuns()
      .catch((err) => log.error('[Automations] Initial reconciliation failed:', err))
      .finally(() => {
        void this.tick();
        setTimeout(() => void this.tickTriggers(), 2_000);
      });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.triggerTimer) {
      clearInterval(this.triggerTimer);
      this.triggerTimer = null;
    }
    if (this.agentExitUnsub) {
      this.agentExitUnsub();
      this.agentExitUnsub = null;
    }
    this.started = false;
    log.info('[Automations] Service stopped');
  }

  // -------------------------------------------------------------------
  // Scheduler tick
  // -------------------------------------------------------------------

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.executeTick();
    } catch (err) {
      log.error('[Automations] Tick failed:', err);
    } finally {
      this.ticking = false;
    }
  }

  private async executeTick(): Promise<void> {
    const triggers: Array<{ automation: Automation; runLogId: string }> = [];

    await dataMutex.run(async () => {
      const now = new Date();
      const nowIso = now.toISOString();

      const dueRows = await db
        .select()
        .from(automationsTable)
        .where(and(eq(automationsTable.status, 'active'), lte(automationsTable.nextRunAt, nowIso)));

      for (const row of dueRows) {
        const automation = mapAutomationRow(row);
        if (automation.mode !== 'schedule') continue;
        if (!automation.nextRunAt) continue;
        if (this.inFlightRuns.has(automation.id)) continue;

        const runLogId = generateId('run');
        const nextRunAt = computeNextRun(automation.schedule, now);
        const nextRunCount = automation.runCount + 1;

        await db
          .update(automationsTable)
          .set({
            lastRunAt: nowIso,
            runCount: nextRunCount,
            nextRunAt,
            updatedAt: nowIso,
          })
          .where(eq(automationsTable.id, automation.id));

        await this.insertRunLog({
          id: runLogId,
          automationId: automation.id,
          startedAt: nowIso,
          finishedAt: null,
          status: 'running',
          error: null,
          taskId: null,
        });

        this.inFlightRuns.add(automation.id);

        triggers.push({
          automation: {
            ...automation,
            lastRunAt: nowIso,
            runCount: nextRunCount,
            nextRunAt,
            updatedAt: nowIso,
          },
          runLogId,
        });
      }
    });

    for (const { automation, runLogId } of triggers) {
      void this.executeAutomation(automation, runLogId);
    }
  }

  // -------------------------------------------------------------------
  // Trigger poll tick
  // -------------------------------------------------------------------

  private async tickTriggers(): Promise<void> {
    if (this.triggerTicking) return;
    this.triggerTicking = true;
    try {
      await this.executeTriggerPoll();
    } catch (err) {
      log.error('[Automations] Trigger poll failed:', err);
    } finally {
      this.triggerTicking = false;
    }
  }

  private async executeTriggerPoll(): Promise<void> {
    const activeAutomations: Automation[] = await dataMutex.run(async () => {
      const rows = await db
        .select()
        .from(automationsTable)
        .where(and(eq(automationsTable.status, 'active'), eq(automationsTable.mode, 'trigger')));
      return rows.map(mapAutomationRow);
    });

    if (activeAutomations.length === 0) return;

    const fetchCache = new Map<string, Promise<RawEvent[]>>();
    const triggers: Array<{ automation: Automation; runLogId: string }> = [];

    for (const automation of activeAutomations) {
      if (!automation.triggerType) continue;

      try {
        const newEvents = await this.fetchNewEventsCached(automation, fetchCache);
        if (newEvents.length === 0) continue;

        for (const event of newEvents) {
          const runLogId = generateId('run');
          const nowIso = new Date().toISOString();
          const enrichedPrompt = this.enrichPromptWithEvent(automation.prompt, event);

          await dataMutex.run(async () => {
            await db
              .update(automationsTable)
              .set({
                lastRunAt: nowIso,
                runCount: sql`${automationsTable.runCount} + 1`,
                updatedAt: nowIso,
              })
              .where(eq(automationsTable.id, automation.id));

            await this.insertRunLog({
              id: runLogId,
              automationId: automation.id,
              startedAt: nowIso,
              finishedAt: null,
              status: 'running',
              error: null,
              taskId: null,
            });
          });

          triggers.push({
            automation: {
              ...automation,
              prompt: enrichedPrompt,
              lastRunAt: nowIso,
              runCount: automation.runCount + 1,
            },
            runLogId,
          });
        }
      } catch (err) {
        log.error(`[Automations] Trigger poll failed for "${automation.name}":`, err);
        await this.setLastRunResult(
          automation.id,
          'failure',
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    for (const { automation, runLogId } of triggers) {
      void this.executeAutomation(automation, runLogId);
    }
  }

  private enrichPromptWithEvent(basePrompt: string, event: RawEvent): string {
    const lines: string[] = [];
    lines.push(`[Triggered by ${event.type}: "${event.title}"]`);
    if (event.url) lines.push(`URL: ${event.url}`);
    if (event.identifier) lines.push(`ID: ${event.identifier}`);
    if (event.extra) lines.push(event.extra);
    if (event.description) lines.push('', event.description);
    return `${lines.join('\n')}\n\n${basePrompt}`;
  }

  // -------------------------------------------------------------------
  // Event fetching (uses v1 issue-provider registry)
  // -------------------------------------------------------------------

  private async fetchNewEventsCached(
    automation: Automation,
    cache: Map<string, Promise<RawEvent[]>>
  ): Promise<RawEvent[]> {
    const known = this.knownEventIds.get(automation.id) ?? new Set<string>();
    const newEvents: RawEvent[] = [];

    const cacheKey = `${automation.projectId}::${automation.triggerType}`;
    let eventsPromise = cache.get(cacheKey);
    if (!eventsPromise) {
      eventsPromise = this.fetchRawEvents(automation);
      cache.set(cacheKey, eventsPromise);
    }
    const rawEvents = await eventsPromise;

    if (!this.knownEventIds.has(automation.id)) {
      this.knownEventIds.set(automation.id, new Set(rawEvents.map((e) => e.id)));
      log.info(
        `[Automations] Seeded ${rawEvents.length} known events for "${automation.name}" (${automation.triggerType})`
      );
      return [];
    }

    for (const event of rawEvents) {
      if (!known.has(event.id)) {
        if (this.matchesTriggerFilters(event, automation.triggerConfig)) {
          newEvents.push(event);
        }
        known.add(event.id);
      }
    }

    if (known.size > 5000) {
      const entries = Array.from(known);
      const toRemove = entries.slice(0, entries.length - 2000);
      for (const id of toRemove) known.delete(id);
    }

    this.knownEventIds.set(automation.id, known);
    return newEvents;
  }

  private matchesTriggerFilters(event: RawEvent, config: TriggerConfig | null): boolean {
    if (!config) return true;

    if (config.labelFilter && config.labelFilter.length > 0) {
      if (!event.labels || event.labels.length === 0) return false;
      const hasMatch = config.labelFilter.some((f) =>
        event.labels!.some((l) => l.toLowerCase() === f.toLowerCase())
      );
      if (!hasMatch) return false;
    }

    if (config.branchFilter) {
      if (!event.branch) return false;
      const pattern = config.branchFilter;
      if (pattern.includes('*')) {
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
        if (!new RegExp('^' + escaped + '$').test(event.branch)) return false;
      } else if (event.branch !== pattern) {
        return false;
      }
    }

    if (config.assigneeFilter) {
      if (!event.assignee) return false;
      if (event.assignee.toLowerCase() !== config.assigneeFilter.toLowerCase()) return false;
    }

    return true;
  }

  private async fetchRawEvents(automation: Automation): Promise<RawEvent[]> {
    if (!automation.triggerType) return [];

    const providerType = this.resolveIssueProviderType(automation.triggerType);
    if (!providerType) {
      log.warn(
        `[Automations] Trigger type ${automation.triggerType} has no v1 adapter mapping yet`
      );
      return [];
    }

    const provider = getIssueProvider(providerType);
    if (!provider) {
      log.warn(`[Automations] Issue provider not registered: ${providerType}`);
      return [];
    }

    const project = await getProjectById(automation.projectId);
    if (!project) return [];

    const status = await provider.checkConnection();
    if (!status.connected) return [];

    const projectPath = project.type === 'local' ? project.path : undefined;
    const nameWithOwner = await this.resolveNameWithOwner(project.id);

    const result = await provider.listIssues({
      projectId: project.id,
      projectPath,
      nameWithOwner: nameWithOwner ?? undefined,
      limit: 30,
    });

    if (!result.success) {
      log.warn(
        `[Automations] Issue fetch failed for "${automation.name}" (${providerType}): ${result.error}`
      );
      return [];
    }

    return result.issues.map((issue) => this.issueToRawEvent(issue, automation.triggerType!));
  }

  private resolveIssueProviderType(triggerType: TriggerType): Issue['provider'] | null {
    switch (triggerType) {
      case 'github_pr':
      case 'github_issue':
        return 'github';
      case 'linear_issue':
        return 'linear';
      case 'jira_issue':
        return 'jira';
      case 'gitlab_issue':
      case 'gitlab_mr':
        return 'gitlab';
      case 'forgejo_issue':
        return 'forgejo';
      case 'plain_thread':
        return 'plain';
    }
  }

  private issueToRawEvent(issue: Issue, triggerType: TriggerType): RawEvent {
    const typeLabel = this.triggerTypeLabel(triggerType);
    return {
      id: `${issue.provider}-${issue.identifier || issue.url}`,
      title: issue.title,
      url: issue.url,
      type: typeLabel,
      extra: issue.identifier ? `${issue.identifier}: ${issue.title}` : issue.title,
      labels: undefined,
      branch: undefined,
      assignee: issue.assignees?.[0],
      identifier: issue.identifier,
      description: issue.description,
    };
  }

  private triggerTypeLabel(triggerType: TriggerType): string {
    switch (triggerType) {
      case 'github_pr':
        return 'GitHub PR';
      case 'github_issue':
        return 'GitHub Issue';
      case 'linear_issue':
        return 'Linear Issue';
      case 'jira_issue':
        return 'Jira Issue';
      case 'gitlab_issue':
        return 'GitLab Issue';
      case 'gitlab_mr':
        return 'GitLab MR';
      case 'forgejo_issue':
        return 'Forgejo Issue';
      case 'plain_thread':
        return 'Plain Thread';
    }
  }

  private async resolveNameWithOwner(projectId: string): Promise<string | null> {
    try {
      const { projectManager } = await import('@main/core/projects/project-manager');
      const provider = projectManager.getProject(projectId);
      if (!provider) return null;
      const remotes = await provider.repository.getRemotes();
      const remote = await provider.repository.getConfiguredRemote();
      const url = remotes.find((r) => r.name === remote)?.url;
      if (!url) return null;
      const { parseNameWithOwner } = await import('@main/core/github/services/utils');
      return parseNameWithOwner(url);
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------
  // Task execution — main-side via createTask
  // -------------------------------------------------------------------

  private async executeAutomation(automation: Automation, runLogId: string): Promise<void> {
    try {
      const project = await getProjectById(automation.projectId);
      if (!project) {
        await this.failRun(runLogId, automation.id, 'Project not found');
        return;
      }

      const sourceBranch = bareRefName(project.baseRef ?? 'refs/heads/main');
      const taskId = crypto.randomUUID();
      const conversationId = crypto.randomUUID();
      const branchSuffix = automation.id.slice(-6);

      if (!isValidProviderId(automation.agentId)) {
        await this.failRun(runLogId, automation.id, `Invalid agent id: ${automation.agentId}`);
        return;
      }
      const providerId: AgentProviderId = automation.agentId;

      const result = await createTask({
        id: taskId,
        projectId: automation.projectId,
        name: `${automation.name} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        sourceBranch: { branch: sourceBranch },
        strategy: automation.useWorktree
          ? { kind: 'new-branch', taskBranch: `automation-${branchSuffix}` }
          : { kind: 'no-worktree' },
        initialConversation: {
          id: conversationId,
          projectId: automation.projectId,
          taskId,
          provider: providerId,
          title: automation.name,
          initialPrompt: automation.prompt,
          autoApprove: true,
        },
      });

      if (!result.success) {
        const errorMsg = this.describeCreateTaskError(result.error);
        await this.failRun(runLogId, automation.id, errorMsg);
        return;
      }

      // Register pending run so agent exit listener finalizes it
      this.pendingRunsByTaskId.set(taskId, {
        automationId: automation.id,
        runLogId,
        taskId,
      });
      await this.updateRunLog(runLogId, { taskId }, automation.id);

      events.emit(automationRunStatusChannel, {
        automationId: automation.id,
        runLogId,
        taskId,
        status: 'started',
      });

      log.info(`[Automations] Dispatched "${automation.name}" → task ${taskId} (run ${runLogId})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`[Automations] Execution failed for "${automation.name}":`, err);
      await this.failRun(runLogId, automation.id, msg);
    }
  }

  private describeCreateTaskError(error: {
    type: string;
    branch?: string;
    message?: string;
  }): string {
    switch (error.type) {
      case 'project-not-found':
        return 'Project not found';
      case 'branch-not-found':
        return `Branch not found: ${error.branch}`;
      case 'branch-already-exists':
        return `Branch already exists: ${error.branch}`;
      case 'invalid-base-branch':
        return `Invalid base branch: ${error.branch}`;
      case 'initial-commit-required':
        return 'Repository has no commits yet';
      case 'worktree-setup-failed':
        return `Worktree setup failed: ${error.message ?? 'unknown'}`;
      case 'pr-fetch-failed':
        return `PR fetch failed: ${error.message ?? 'unknown'}`;
      case 'provision-failed':
        return `Provision failed: ${error.message ?? 'unknown'}`;
      default:
        return `Task creation failed: ${error.type}`;
    }
  }

  private async handleAgentSessionExited(
    taskId: string,
    exitCode: number | undefined
  ): Promise<void> {
    const pending = this.pendingRunsByTaskId.get(taskId);
    if (!pending) return;
    this.pendingRunsByTaskId.delete(taskId);

    const nowIso = new Date().toISOString();
    const isSuccess = exitCode === 0 || exitCode === undefined;
    const status: AutomationRunLog['status'] = isSuccess ? 'success' : 'failure';
    const errorMsg = isSuccess ? null : `Agent exited with code ${exitCode}`;

    try {
      await this.updateRunLog(
        pending.runLogId,
        { status, error: errorMsg, finishedAt: nowIso },
        pending.automationId
      );
      await this.setLastRunResult(
        pending.automationId,
        status as 'success' | 'failure',
        errorMsg ?? undefined
      );
      events.emit(automationRunStatusChannel, {
        automationId: pending.automationId,
        runLogId: pending.runLogId,
        taskId,
        status: 'ended',
      });
      log.info(`[Automations] Run ${pending.runLogId} finalized: ${status} (task ${taskId})`);
    } catch (err) {
      log.error('[Automations] Failed to finalize run log on agent exit:', err);
    }
  }

  // -------------------------------------------------------------------
  // Run log internals
  // -------------------------------------------------------------------

  private async insertRunLog(runLog: AutomationRunLog): Promise<void> {
    await db
      .insert(automationRunLogsTable)
      .values({
        id: runLog.id,
        automationId: runLog.automationId,
        startedAt: runLog.startedAt,
        finishedAt: runLog.finishedAt,
        status: runLog.status,
        error: runLog.error,
        taskId: runLog.taskId,
      })
      .onConflictDoNothing();

    const perAutomationRows = await db
      .select({ id: automationRunLogsTable.id })
      .from(automationRunLogsTable)
      .where(eq(automationRunLogsTable.automationId, runLog.automationId))
      .orderBy(desc(automationRunLogsTable.startedAt), desc(automationRunLogsTable.id));

    if (perAutomationRows.length > MAX_RUNS_PER_AUTOMATION) {
      const idsToDelete = perAutomationRows.slice(MAX_RUNS_PER_AUTOMATION).map((row) => row.id);
      await db
        .delete(automationRunLogsTable)
        .where(inArray(automationRunLogsTable.id, idsToDelete));
    }

    const allRows = await db
      .select({ id: automationRunLogsTable.id })
      .from(automationRunLogsTable)
      .orderBy(desc(automationRunLogsTable.startedAt), desc(automationRunLogsTable.id));

    if (allRows.length > MAX_TOTAL_RUNS) {
      const idsToDelete = allRows.slice(MAX_TOTAL_RUNS).map((row) => row.id);
      await db
        .delete(automationRunLogsTable)
        .where(inArray(automationRunLogsTable.id, idsToDelete));
    }
  }

  private async failRun(
    runLogId: string,
    automationId: string,
    errorMessage: string
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.updateRunLog(
      runLogId,
      { status: 'failure', error: errorMessage, finishedAt: nowIso },
      automationId
    );
    await this.setLastRunResult(automationId, 'failure', errorMessage);
    events.emit(automationRunStatusChannel, {
      automationId,
      runLogId,
      taskId: null,
      status: 'ended',
    });
  }

  // -------------------------------------------------------------------
  // Public CRUD
  // -------------------------------------------------------------------

  async list(): Promise<Automation[]> {
    const rows = await db
      .select()
      .from(automationsTable)
      .orderBy(sql`rowid asc`);
    return rows.map(mapAutomationRow);
  }

  async get(id: string): Promise<Automation | null> {
    const rows = await db
      .select()
      .from(automationsTable)
      .where(eq(automationsTable.id, id))
      .limit(1);
    const row = rows[0];
    return row ? mapAutomationRow(row) : null;
  }

  async create(input: CreateAutomationInput): Promise<Automation> {
    const mode: AutomationMode = input.mode ?? 'schedule';
    if (mode === 'schedule') validateSchedule(input.schedule);
    if (mode === 'trigger' && !input.triggerType) {
      throw new Error('triggerType is required when mode is "trigger"');
    }

    const project = await getProjectById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);

    const now = new Date().toISOString();
    const isTrigger = mode === 'trigger';
    const automation: Automation = {
      id: generateId('auto'),
      name: input.name,
      projectId: input.projectId,
      projectName: input.projectName ?? project.name ?? '',
      prompt: input.prompt,
      agentId: input.agentId,
      mode,
      schedule: input.schedule,
      triggerType: isTrigger ? (input.triggerType ?? null) : null,
      triggerConfig: isTrigger ? (input.triggerConfig ?? null) : null,
      useWorktree: input.useWorktree ?? true,
      status: 'active',
      lastRunAt: null,
      nextRunAt: isTrigger ? null : computeNextRun(input.schedule),
      runCount: 0,
      lastRunResult: null,
      lastRunError: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(automationsTable).values({
      id: automation.id,
      projectId: automation.projectId,
      projectName: automation.projectName,
      name: automation.name,
      prompt: automation.prompt,
      agentId: automation.agentId,
      mode: automation.mode,
      schedule: serializeSchedule(automation.schedule),
      triggerType: automation.triggerType,
      triggerConfig: serializeTriggerConfig(automation.triggerConfig),
      useWorktree: automation.useWorktree ? 1 : 0,
      status: automation.status,
      lastRunAt: automation.lastRunAt,
      nextRunAt: automation.nextRunAt,
      runCount: automation.runCount,
      lastRunResult: automation.lastRunResult,
      lastRunError: automation.lastRunError,
      createdAt: automation.createdAt,
      updatedAt: automation.updatedAt,
    });

    log.info(`[Automations] Created "${automation.name}" (${automation.id})`);

    if (isTrigger) {
      void this.seedAutomationEvents(automation);
    }

    return automation;
  }

  private async seedAutomationEvents(automation: Automation): Promise<void> {
    try {
      const rawEvents = await this.fetchRawEvents(automation);
      this.knownEventIds.set(automation.id, new Set(rawEvents.map((e) => e.id)));
      log.info(
        `[Automations] Pre-seeded ${rawEvents.length} events for "${automation.name}" (${automation.triggerType})`
      );
    } catch (err) {
      log.warn(`[Automations] Failed to pre-seed events for "${automation.name}":`, err);
    }
  }

  async update(input: UpdateAutomationInput): Promise<Automation | null> {
    if (input.schedule) validateSchedule(input.schedule);

    const rows = await db
      .select()
      .from(automationsTable)
      .where(eq(automationsTable.id, input.id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    const current = mapAutomationRow(row);
    const nextMode = input.mode ?? current.mode;
    const nextSchedule = input.schedule ?? current.schedule;
    const nextUpdatedAt = new Date().toISOString();
    const isTrigger = nextMode === 'trigger';

    const updated: Automation = {
      ...current,
      name: input.name ?? current.name,
      projectId: input.projectId ?? current.projectId,
      projectName: input.projectName ?? current.projectName,
      prompt: input.prompt ?? current.prompt,
      agentId: input.agentId ?? current.agentId,
      mode: nextMode,
      status: input.status ?? current.status,
      useWorktree: input.useWorktree ?? current.useWorktree,
      schedule: nextSchedule,
      triggerType:
        input.triggerType !== undefined
          ? input.triggerType
          : isTrigger
            ? current.triggerType
            : null,
      triggerConfig:
        input.triggerConfig !== undefined
          ? input.triggerConfig
          : isTrigger
            ? current.triggerConfig
            : null,
      nextRunAt: isTrigger
        ? null
        : input.schedule
          ? computeNextRun(nextSchedule)
          : current.nextRunAt,
      updatedAt: nextUpdatedAt,
    };

    await db
      .update(automationsTable)
      .set({
        name: updated.name,
        projectId: updated.projectId,
        projectName: updated.projectName,
        prompt: updated.prompt,
        agentId: updated.agentId,
        mode: updated.mode,
        schedule: serializeSchedule(updated.schedule),
        triggerType: updated.triggerType,
        triggerConfig: serializeTriggerConfig(updated.triggerConfig),
        useWorktree: updated.useWorktree ? 1 : 0,
        status: updated.status,
        nextRunAt: updated.nextRunAt,
        updatedAt: updated.updatedAt,
      })
      .where(eq(automationsTable.id, updated.id));

    log.info(`[Automations] Updated "${updated.name}" (${updated.id})`);

    const triggerTypeChanged =
      updated.mode === 'trigger' &&
      (input.triggerType !== undefined || input.mode === 'trigger') &&
      updated.triggerType !== current.triggerType;
    const switchedToTrigger = input.mode === 'trigger' && current.mode !== 'trigger';
    const projectChanged =
      updated.mode === 'trigger' &&
      input.projectId !== undefined &&
      input.projectId !== current.projectId;

    if (triggerTypeChanged || switchedToTrigger || projectChanged) {
      this.knownEventIds.delete(updated.id);
      void this.seedAutomationEvents(updated);
    }

    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const before = await db
      .select({ id: automationsTable.id })
      .from(automationsTable)
      .where(eq(automationsTable.id, id))
      .limit(1);
    if (before.length === 0) return false;

    await db.delete(automationsTable).where(eq(automationsTable.id, id));
    this.knownEventIds.delete(id);
    this.inFlightRuns.delete(id);
    log.info(`[Automations] Deleted automation ${id}`);
    return true;
  }

  async toggleStatus(id: string): Promise<Automation | null> {
    const rows = await db
      .select()
      .from(automationsTable)
      .where(eq(automationsTable.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    const automation = mapAutomationRow(row);
    const nextStatus: Automation['status'] = automation.status === 'active' ? 'paused' : 'active';
    const nowIso = new Date().toISOString();

    const updated: Automation = {
      ...automation,
      status: nextStatus,
      nextRunAt:
        nextStatus === 'active' && automation.mode === 'schedule'
          ? computeNextRun(automation.schedule)
          : automation.mode === 'trigger'
            ? null
            : automation.nextRunAt,
      lastRunError: nextStatus === 'active' ? null : automation.lastRunError,
      updatedAt: nowIso,
    };

    await db
      .update(automationsTable)
      .set({
        status: updated.status,
        nextRunAt: updated.nextRunAt,
        lastRunError: updated.lastRunError,
        updatedAt: updated.updatedAt,
      })
      .where(eq(automationsTable.id, id));

    if (nextStatus === 'active' && updated.mode === 'trigger') {
      this.knownEventIds.delete(updated.id);
      void this.seedAutomationEvents(updated);
    }

    return updated;
  }

  async triggerNow(id: string): Promise<Automation | null> {
    const rows = await db
      .select()
      .from(automationsTable)
      .where(eq(automationsTable.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    const automation = mapAutomationRow(row);
    if (this.inFlightRuns.has(automation.id)) {
      throw new Error('Automation is already running');
    }

    const runLogId = generateId('run');
    const nowIso = new Date().toISOString();
    const nextRunCount = automation.runCount + 1;

    await dataMutex.run(async () => {
      await db
        .update(automationsTable)
        .set({
          lastRunAt: nowIso,
          runCount: nextRunCount,
          updatedAt: nowIso,
        })
        .where(eq(automationsTable.id, automation.id));

      await this.insertRunLog({
        id: runLogId,
        automationId: automation.id,
        startedAt: nowIso,
        finishedAt: null,
        status: 'running',
        error: null,
        taskId: null,
      });

      this.inFlightRuns.add(automation.id);
    });

    const updatedAutomation: Automation = {
      ...automation,
      lastRunAt: nowIso,
      runCount: nextRunCount,
      updatedAt: nowIso,
    };

    void this.executeAutomation(updatedAutomation, runLogId);
    return updatedAutomation;
  }

  // -------------------------------------------------------------------
  // Run logs
  // -------------------------------------------------------------------

  async getRunLogs(automationId: string, limit = 20): Promise<AutomationRunLog[]> {
    const rows = await db
      .select()
      .from(automationRunLogsTable)
      .where(eq(automationRunLogsTable.automationId, automationId))
      .orderBy(desc(automationRunLogsTable.startedAt), desc(automationRunLogsTable.id))
      .limit(limit);
    return rows.map(mapRunRow);
  }

  async updateRunLog(
    runId: string,
    update: Partial<Pick<AutomationRunLog, 'status' | 'error' | 'finishedAt' | 'taskId'>>,
    automationId?: string
  ): Promise<void> {
    await db
      .update(automationRunLogsTable)
      .set({
        status: update.status,
        error: update.error,
        finishedAt: update.finishedAt,
        taskId: update.taskId,
      })
      .where(eq(automationRunLogsTable.id, runId));

    if (automationId && (update.status === 'success' || update.status === 'failure')) {
      this.inFlightRuns.delete(automationId);
    }
  }

  async setLastRunResult(
    automationId: string,
    result: 'success' | 'failure',
    error?: string
  ): Promise<void> {
    await db
      .update(automationsTable)
      .set({
        lastRunResult: result,
        lastRunError: error ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(automationsTable.id, automationId));
  }

  // -------------------------------------------------------------------
  // Reconciliation
  // -------------------------------------------------------------------

  async reconcileMissedRuns(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;

    try {
      const triggers: Array<{ automation: Automation; runLogId: string }> = [];

      await dataMutex.run(async () => {
        const now = new Date();
        const nowIso = now.toISOString();

        // Fail orphaned "running" logs
        const runningRows = await db
          .select()
          .from(automationRunLogsTable)
          .where(eq(automationRunLogsTable.status, 'running'));

        const affectedErrors = new Map<string, string>();
        for (const row of runningRows) {
          const startedAt = new Date(row.startedAt);
          const elapsed = now.getTime() - startedAt.getTime();
          const errMsg =
            elapsed > DEFAULT_MAX_RUN_DURATION_MS
              ? `Run timed out after ${Math.round(elapsed / 60_000)} minutes`
              : 'Interrupted (app was closed or crashed)';

          await db
            .update(automationRunLogsTable)
            .set({ status: 'failure', error: errMsg, finishedAt: nowIso })
            .where(eq(automationRunLogsTable.id, row.id));

          this.inFlightRuns.delete(row.automationId);
          affectedErrors.set(row.automationId, errMsg);
        }

        for (const [automationId, lastRunError] of affectedErrors) {
          await db
            .update(automationsTable)
            .set({
              lastRunResult: 'failure',
              lastRunError,
              updatedAt: nowIso,
            })
            .where(eq(automationsTable.id, automationId));
        }

        // Catch up missed schedules
        const dueRows = await db
          .select()
          .from(automationsTable)
          .where(
            and(eq(automationsTable.status, 'active'), lte(automationsTable.nextRunAt, nowIso))
          );

        for (const row of dueRows) {
          const automation = mapAutomationRow(row);
          if (automation.mode !== 'schedule') continue;
          if (!automation.nextRunAt) continue;
          if (this.inFlightRuns.has(automation.id)) continue;

          const runLogId = generateId('run');
          const nextRunAt = computeNextRun(automation.schedule, now);
          const nextRunCount = automation.runCount + 1;

          await db
            .update(automationsTable)
            .set({
              lastRunAt: nowIso,
              runCount: nextRunCount,
              nextRunAt,
              updatedAt: nowIso,
            })
            .where(eq(automationsTable.id, automation.id));

          await this.insertRunLog({
            id: runLogId,
            automationId: automation.id,
            startedAt: nowIso,
            finishedAt: null,
            status: 'running',
            error: null,
            taskId: null,
          });

          this.inFlightRuns.add(automation.id);

          triggers.push({
            automation: {
              ...automation,
              lastRunAt: nowIso,
              runCount: nextRunCount,
              nextRunAt,
              updatedAt: nowIso,
            },
            runLogId,
          });
        }
      });

      for (const { automation, runLogId } of triggers) {
        void this.executeAutomation(automation, runLogId);
      }
    } finally {
      this.reconciling = false;
    }
  }
}

export const automationsService = new AutomationsService();
