import crypto from 'node:crypto';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { isValidProviderId, type AgentProviderId } from '@shared/agent-provider-registry';
import {
  TRIGGER_INTEGRATION_MAP,
  type Automation,
  type AutomationMode,
  type AutomationRunLog,
  type AutomationSchedule,
  type CreateAutomationInput,
  type TriggerConfig,
  type TriggerType,
  type UpdateAutomationInput,
} from '@shared/automations/types';
import { agentSessionExitedChannel } from '@shared/events/agentEvents';
import { automationRunStatusChannel } from '@shared/events/automationEvents';
import { bareRefName } from '@shared/git-utils';
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
import {
  buildMemoryPromptSection,
  deleteAutomationMemory,
  loadAutomationMemory,
  resetAutomationMemory,
  writeAutomationMemory,
} from './memory';
import {
  persistRunLogUpdate,
  pruneRunLogs,
  startRunAtomic,
  writeLastRunResult,
} from './run-log-store';
import {
  computeNextRun,
  deserializeSchedule,
  serializeSchedule,
  validateSchedule,
} from './schedule-utils';
import {
  assertSupportedTriggerType,
  enrichPromptWithEvent,
  issueToRawEvent,
  isSupportedTriggerType,
  listUnsupportedFilters,
  matchesTriggerFilters,
  resolveIssueProviderType,
  type RawEvent,
} from './trigger-mapping';

// ---------------------------------------------------------------------------
// Prompt mention expansion ($github, $linear, …)
// ---------------------------------------------------------------------------

const MENTION_HINTS: Record<string, string> = {
  github:
    'GitHub — use the gh CLI or connected GitHub integration for issues, PRs, and repo context.',
  linear: 'Linear — use the connected Linear integration to read and update tickets.',
  jira: 'Jira — use the connected Jira integration to read and update issues.',
  gitlab: 'GitLab — use the glab CLI or connected GitLab integration for issues and MRs.',
  forgejo: 'Forgejo — use the connected Forgejo integration for issues and PRs.',
  plain: 'Plain — use the connected Plain integration to read and reply to customer threads.',
};

const MENTION_SCAN_REGEX = /\$([a-zA-Z][a-zA-Z0-9_-]*)/g;

function expandMentionsInPrompt(prompt: string): string {
  const seen = new Set<string>();
  for (const match of prompt.matchAll(MENTION_SCAN_REGEX)) {
    const token = match[1].toLowerCase();
    if (MENTION_HINTS[token]) seen.add(token);
  }
  if (seen.size === 0) return prompt;
  const lines = [...seen].map((token) => `- $${token} → ${MENTION_HINTS[token]}`);
  return `${prompt}\n\n---\nReferenced integrations:\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// AsyncMutex — promise-chaining based mutex
// ---------------------------------------------------------------------------

class AsyncMutex {
  private chain: Promise<unknown> = Promise.resolve();

  run<T>(fn: () => Promise<T>): Promise<T> {
    // Each caller awaits their own `fn`, but subsequent callers must wait even
    // if we reject — so the chain we store always resolves.
    const next = this.chain.then(fn, fn);
    this.chain = next.catch(() => undefined);
    return next;
  }
}

const dataMutex = new AsyncMutex();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_AUTOMATION_STATUS: Automation['status'][] = ['active', 'paused', 'error'];
const VALID_RUN_STATUS: AutomationRunLog['status'][] = ['running', 'success', 'failure'];

const DEFAULT_MAX_RUN_DURATION_MS = 2 * 60 * 60 * 1000; // 2h
const SCHEDULER_TICK_MS = 30_000;
const TRIGGER_TICK_MS = 30_000;
const TRIGGER_EVENT_FETCH_LIMIT = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  if (value === 'trigger' || value === 'schedule') return value;
  log.warn(`[Automations] Unknown mode in DB row, defaulting to 'schedule': ${String(value)}`);
  return 'schedule';
}

function normalizeTriggerType(value: unknown): TriggerType | null {
  if (typeof value === 'string' && value in TRIGGER_INTEGRATION_MAP) {
    return value as TriggerType;
  }
  if (value != null && value !== '') {
    log.warn(`[Automations] Unknown trigger type in DB row, dropping: ${String(value)}`);
  }
  return null;
}

function serializeTriggerConfig(config: TriggerConfig | null | undefined): string | null {
  if (!config) return null;
  return JSON.stringify(config);
}

function deserializeTriggerConfig(serialized: string | null): TriggerConfig | null {
  if (!serialized) return null;
  try {
    return JSON.parse(serialized) as TriggerConfig;
  } catch (err) {
    log.warn('[Automations] Failed to parse trigger config, ignoring:', err);
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

export class AutomationsService {
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

  /** Automations currently being seeded — prevents trigger-tick from racing. */
  private seedingAutomations = new Set<string>();

  /** Automation ids we've already warned about unsupported filters for. */
  private warnedUnsupportedFilters = new Set<string>();

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

  /**
   * Advance one due scheduled automation: update its nextRunAt/runCount, insert a running run-log,
   * and return the updated automation + runLogId for dispatch. Assumes `dataMutex` is held.
   */
  private async dispatchDueSchedule(
    automation: Automation,
    now: Date
  ): Promise<{ automation: Automation; runLogId: string } | null> {
    if (automation.mode !== 'schedule') return null;
    if (!automation.nextRunAt) return null;
    if (this.inFlightRuns.has(automation.id)) return null;

    const nowIso = now.toISOString();
    const runLogId = generateId('run');
    const nextRunAt = computeNextRun(automation.schedule, now, new Date(automation.createdAt));
    const nextRunCount = automation.runCount + 1;

    startRunAtomic({
      automationId: automation.id,
      nowIso,
      runCount: nextRunCount,
      nextRunAt,
      runLogId,
    });
    await pruneRunLogs(automation.id);

    this.inFlightRuns.add(automation.id);

    return {
      automation: {
        ...automation,
        lastRunAt: nowIso,
        runCount: nextRunCount,
        nextRunAt,
        updatedAt: nowIso,
      },
      runLogId,
    };
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
        const dispatched = await this.dispatchDueSchedule(mapAutomationRow(row), now);
        if (dispatched) triggers.push(dispatched);
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
      if (this.inFlightRuns.has(automation.id)) continue;
      if (this.seedingAutomations.has(automation.id)) continue;

      const ignoredFilters = listUnsupportedFilters(automation.triggerConfig);
      if (ignoredFilters.length > 0 && !this.warnedUnsupportedFilters.has(automation.id)) {
        this.warnedUnsupportedFilters.add(automation.id);
        log.warn(
          `[Automations] "${automation.name}" has filters that the current matcher ignores: ${ignoredFilters.join(', ')}`
        );
      }

      try {
        const newEvents = await this.fetchNewEventsDelta(automation, fetchCache);
        if (newEvents.length === 0) continue;

        // Dispatch at most one event per tick per automation so inFlightRuns
        // stays honest; the rest are left uncommitted and will be re-detected
        // on the next poll once this run completes.
        const event = newEvents[0];
        const runLogId = generateId('run');
        const nowIso = new Date().toISOString();
        const enrichedPrompt = enrichPromptWithEvent(automation.prompt, event);
        const nextRunCount = automation.runCount + 1;

        await dataMutex.run(async () => {
          if (this.inFlightRuns.has(automation.id)) return;
          startRunAtomic({
            automationId: automation.id,
            nowIso,
            runCount: nextRunCount,
            nextRunAt: null,
            runLogId,
          });
          this.inFlightRuns.add(automation.id);
          this.commitKnownEvent(automation.id, event.id);
        });
        await pruneRunLogs(automation.id);

        if (!this.inFlightRuns.has(automation.id)) continue;

        triggers.push({
          automation: {
            ...automation,
            prompt: enrichedPrompt,
            lastRunAt: nowIso,
            runCount: nextRunCount,
          },
          runLogId,
        });
      } catch (err) {
        log.error(`[Automations] Trigger poll failed for "${automation.name}":`, err);
        await writeLastRunResult(
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

  private commitKnownEvent(automationId: string, eventId: string): void {
    const known = this.knownEventIds.get(automationId) ?? new Set<string>();
    known.add(eventId);
    if (known.size > 5000) {
      const entries = Array.from(known);
      const toRemove = entries.slice(0, entries.length - 2000);
      for (const id of toRemove) known.delete(id);
    }
    this.knownEventIds.set(automationId, known);
  }

  // -------------------------------------------------------------------
  // Event fetching (uses v1 issue-provider registry)
  // -------------------------------------------------------------------

  private async fetchNewEventsDelta(
    automation: Automation,
    cache: Map<string, Promise<RawEvent[]>>
  ): Promise<RawEvent[]> {
    const cacheKey = `${automation.projectId}::${automation.triggerType}`;
    let eventsPromise = cache.get(cacheKey);
    if (!eventsPromise) {
      eventsPromise = this.fetchRawEvents(automation);
      cache.set(cacheKey, eventsPromise);
    }
    const rawEvents = await eventsPromise;

    if (!this.knownEventIds.has(automation.id)) {
      // First sighting — seed and do not fire.
      this.knownEventIds.set(automation.id, new Set(rawEvents.map((e) => e.id)));
      log.info(
        `[Automations] Seeded ${rawEvents.length} known events for "${automation.name}" (${automation.triggerType})`
      );
      return [];
    }

    const known = this.knownEventIds.get(automation.id) ?? new Set<string>();
    const newEvents: RawEvent[] = [];
    for (const event of rawEvents) {
      if (!known.has(event.id) && matchesTriggerFilters(event, automation.triggerConfig)) {
        newEvents.push(event);
      }
    }
    return newEvents;
  }

  private async fetchRawEvents(automation: Automation): Promise<RawEvent[]> {
    const triggerType = automation.triggerType;
    if (!triggerType) return [];

    if (!isSupportedTriggerType(triggerType)) {
      log.warn(`[Automations] Trigger type not supported yet: ${triggerType}`);
      return [];
    }

    const providerType = resolveIssueProviderType(triggerType);

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
      limit: TRIGGER_EVENT_FETCH_LIMIT,
    });

    if (!result.success) {
      log.warn(
        `[Automations] Issue fetch failed for "${automation.name}" (${providerType}): ${result.error}`
      );
      return [];
    }

    if (result.issues.length >= TRIGGER_EVENT_FETCH_LIMIT) {
      log.warn(
        `[Automations] Trigger fetch reached limit (${TRIGGER_EVENT_FETCH_LIMIT}) for "${automation.name}". Increase limit or poll frequency to avoid missing bursts.`
      );
    }

    return result.issues.map((issue) => issueToRawEvent(issue, triggerType));
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

      let promptWithMemory = expandMentionsInPrompt(automation.prompt);
      try {
        const { path: memoryFilePath, content: memoryContent } = await loadAutomationMemory(
          automation.id
        );
        promptWithMemory = `${promptWithMemory}\n\n${buildMemoryPromptSection(memoryFilePath, memoryContent)}`;
      } catch (err) {
        log.warn(`[Automations] Failed to load memory for ${automation.id}:`, err);
      }

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
          initialPrompt: promptWithMemory,
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
    const isSuccess = exitCode === 0;
    const status: 'success' | 'failure' = isSuccess ? 'success' : 'failure';
    const errorMsg = isSuccess
      ? null
      : exitCode === undefined
        ? 'Agent exited without status (likely killed or signalled)'
        : `Agent exited with code ${exitCode}`;

    try {
      await this.updateRunLog(
        pending.runLogId,
        { status, error: errorMsg, finishedAt: nowIso },
        pending.automationId
      );
      await writeLastRunResult(pending.automationId, status, errorMsg ?? undefined);
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
    await writeLastRunResult(automationId, 'failure', errorMessage);
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
    if (mode === 'schedule') {
      if (!input.schedule) {
        throw new Error('schedule is required when mode is "schedule"');
      }
      validateSchedule(input.schedule);
    }
    if (mode === 'trigger' && !input.triggerType) {
      throw new Error('triggerType is required when mode is "trigger"');
    }
    if (mode === 'trigger' && input.triggerType) {
      assertSupportedTriggerType(input.triggerType);
    }

    const project = await getProjectById(input.projectId);
    if (!project) throw new Error(`Project not found: ${input.projectId}`);

    const now = new Date().toISOString();
    const isTrigger = mode === 'trigger';
    // Triggers don't use a schedule; store a stable placeholder so the persisted
    // entity shape stays uniform without polluting the create API.
    const schedule: AutomationSchedule = isTrigger
      ? { type: 'daily', hour: 9, minute: 0 }
      : (input.schedule as AutomationSchedule);
    const status = input.status ?? 'active';
    const automation: Automation = {
      id: generateId('auto'),
      name: input.name,
      projectId: input.projectId,
      projectName: input.projectName ?? project.name ?? '',
      prompt: input.prompt,
      agentId: input.agentId,
      mode,
      schedule,
      triggerType: isTrigger ? (input.triggerType ?? null) : null,
      triggerConfig: isTrigger ? (input.triggerConfig ?? null) : null,
      useWorktree: input.useWorktree ?? true,
      status,
      lastRunAt: null,
      nextRunAt:
        isTrigger || status === 'paused'
          ? null
          : computeNextRun(schedule, new Date(now), new Date(now)),
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
    if (this.seedingAutomations.has(automation.id)) return;
    this.seedingAutomations.add(automation.id);
    try {
      const rawEvents = await this.fetchRawEvents(automation);
      await dataMutex.run(async () => {
        this.knownEventIds.set(automation.id, new Set(rawEvents.map((e) => e.id)));
      });
      log.info(
        `[Automations] Pre-seeded ${rawEvents.length} events for "${automation.name}" (${automation.triggerType})`
      );
    } catch (err) {
      log.warn(`[Automations] Failed to pre-seed events for "${automation.name}":`, err);
    } finally {
      this.seedingAutomations.delete(automation.id);
    }
  }

  async update(input: UpdateAutomationInput): Promise<Automation | null> {
    const rows = await db
      .select()
      .from(automationsTable)
      .where(eq(automationsTable.id, input.id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;

    const current = mapAutomationRow(row);
    const nextMode = input.mode ?? current.mode;
    const nextSchedule =
      nextMode === 'schedule' ? (input.schedule ?? current.schedule) : current.schedule;
    if (nextMode === 'schedule') {
      validateSchedule(nextSchedule);
    }
    const nextUpdatedAt = new Date().toISOString();
    const isTrigger = nextMode === 'trigger';
    const nextProjectId = input.projectId ?? current.projectId;
    const projectChanged = nextProjectId !== current.projectId;
    const nextProject = projectChanged ? await getProjectById(nextProjectId) : null;

    if (projectChanged && !nextProject) {
      throw new Error(`Project not found: ${nextProjectId}`);
    }

    const nextTriggerType =
      input.triggerType !== undefined ? input.triggerType : isTrigger ? current.triggerType : null;

    if (isTrigger && !nextTriggerType) {
      throw new Error('triggerType is required when mode is "trigger"');
    }
    const shouldValidateTriggerType =
      nextTriggerType !== null &&
      (nextTriggerType !== current.triggerType || current.mode !== 'trigger');

    if (shouldValidateTriggerType && nextTriggerType) {
      assertSupportedTriggerType(nextTriggerType);
    }

    const updated: Automation = {
      ...current,
      name: input.name ?? current.name,
      projectId: nextProjectId,
      projectName: input.projectName ?? nextProject?.name ?? current.projectName,
      prompt: input.prompt ?? current.prompt,
      agentId: input.agentId ?? current.agentId,
      mode: nextMode,
      status: input.status ?? current.status,
      useWorktree: input.useWorktree ?? current.useWorktree,
      schedule: nextSchedule,
      triggerType: nextTriggerType,
      triggerConfig:
        input.triggerConfig !== undefined
          ? input.triggerConfig
          : isTrigger
            ? current.triggerConfig
            : null,
      nextRunAt: isTrigger
        ? null
        : input.schedule
          ? computeNextRun(nextSchedule, new Date(nextUpdatedAt), new Date(nextUpdatedAt))
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
    const triggerProjectChanged = updated.mode === 'trigger' && projectChanged;

    if (triggerTypeChanged || switchedToTrigger || triggerProjectChanged) {
      await dataMutex.run(async () => {
        this.knownEventIds.delete(updated.id);
      });
      void this.seedAutomationEvents(updated);
    }

    if (input.triggerConfig !== undefined) {
      this.warnedUnsupportedFilters.delete(updated.id);
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
    this.seedingAutomations.delete(id);
    this.warnedUnsupportedFilters.delete(id);
    await deleteAutomationMemory(id);
    log.info(`[Automations] Deleted automation ${id}`);
    return true;
  }

  async getMemory(id: string): Promise<{ path: string; content: string } | null> {
    const automation = await this.get(id);
    if (!automation) return null;
    return loadAutomationMemory(id);
  }

  async setMemory(id: string, content: string): Promise<{ path: string; content: string } | null> {
    const automation = await this.get(id);
    if (!automation) return null;
    return writeAutomationMemory(id, content);
  }

  async clearMemory(id: string): Promise<{ path: string; content: string } | null> {
    const automation = await this.get(id);
    if (!automation) return null;
    return resetAutomationMemory(id);
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
          ? computeNextRun(automation.schedule, new Date(nowIso), new Date(automation.createdAt))
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
      await dataMutex.run(async () => {
        this.knownEventIds.delete(updated.id);
      });
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
    const runLogId = generateId('run');
    const nowIso = new Date().toISOString();
    const nextRunCount = automation.runCount + 1;

    await dataMutex.run(async () => {
      if (this.inFlightRuns.has(automation.id)) {
        throw new Error('Automation is already running');
      }

      startRunAtomic({
        automationId: automation.id,
        nowIso,
        runCount: nextRunCount,
        nextRunAt: automation.nextRunAt,
        runLogId,
      });

      this.inFlightRuns.add(automation.id);
    });
    await pruneRunLogs(automation.id);

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

  /**
   * Persist a run-log update. When the update carries a terminal status the
   * automation's in-flight marker is cleared so subsequent ticks may dispatch
   * again. `automationId` is required to keep that bookkeeping honest.
   */
  async updateRunLog(
    runId: string,
    update: Partial<Pick<AutomationRunLog, 'status' | 'error' | 'finishedAt' | 'taskId'>>,
    automationId: string
  ): Promise<void> {
    await persistRunLogUpdate(runId, update);
    if (update.status === 'success' || update.status === 'failure') {
      this.inFlightRuns.delete(automationId);
    }
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
          const dispatched = await this.dispatchDueSchedule(mapAutomationRow(row), now);
          if (dispatched) triggers.push(dispatched);
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
