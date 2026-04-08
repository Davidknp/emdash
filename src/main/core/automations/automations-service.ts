import crypto from 'node:crypto';
import { and, desc, eq, lte } from 'drizzle-orm';
import { isValidProviderId, type AgentProviderId } from '@shared/agent-provider-registry';
import type {
  Automation,
  AutomationRunLog,
  AutomationSchedule,
  CreateAutomationInput,
  DayOfWeek,
  TriggerType,
  UpdateAutomationInput,
} from '@shared/automations/types';
import { taskCreatedExternallyChannel } from '@shared/events/appEvents';
import { forgejoService } from '@main/core/forgejo/forgejo-service';
import { issueService } from '@main/core/github/services/issue-service';
import { gitlabService } from '@main/core/gitlab/gitlab-service';
import JiraService from '@main/core/jira/JiraService';
import { linearService } from '@main/core/linear/LinearService';
import { plainService } from '@main/core/plain/plain-service';
import { projectManager } from '@main/core/projects/project-manager';
import { prService } from '@main/core/pull-requests/pr-service';
import { createTask } from '@main/core/tasks/createTask';
import { db } from '@main/db/client';
import { automationRunLogs, automations, projects } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';

type RawEvent = {
  id: string;
  title: string;
  url?: string;
  labels?: string[];
  assignee?: string;
  branch?: string;
  createdAt?: string;
};

const DAY_ORDER: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function computeNextRun(schedule: AutomationSchedule, fromDate = new Date()): string {
  const now = new Date(fromDate);
  const next = new Date(now);
  const hour = schedule.hour ?? 0;
  const minute = schedule.minute ?? 0;

  switch (schedule.type) {
    case 'hourly':
      next.setMinutes(minute, 0, 0);
      if (next <= now) next.setHours(next.getHours() + 1);
      break;
    case 'daily':
      next.setHours(hour, minute, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      break;
    case 'weekly': {
      const target = DAY_ORDER.indexOf(schedule.dayOfWeek ?? 'mon');
      const current = next.getDay();
      let delta = target - current;
      if (delta < 0) delta += 7;
      next.setDate(next.getDate() + delta);
      next.setHours(hour, minute, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 7);
      break;
    }
    case 'monthly': {
      const desiredDay = schedule.dayOfMonth ?? 1;
      const monthDays = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(desiredDay, monthDays));
      next.setHours(hour, minute, 0, 0);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
        const nextMonthDays = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(desiredDay, nextMonthDays));
      }
      break;
    }
  }

  return next.toISOString();
}

function parseNameWithOwner(remote?: string | null): string | null {
  if (!remote) return null;
  const ssh = /^git@[^:]+:(.+?)(?:\.git)?$/.exec(remote);
  if (ssh?.[1]) return ssh[1];
  const https = /^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/.exec(remote);
  if (https?.[1]) return https[1];
  return null;
}

function mapAutomation(row: typeof automations.$inferSelect): Automation {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    name: row.name,
    prompt: row.prompt,
    agentId: row.agentId,
    mode: row.mode === 'trigger' ? 'trigger' : 'schedule',
    schedule: JSON.parse(row.schedule) as AutomationSchedule,
    triggerType: (row.triggerType as TriggerType | null) ?? null,
    triggerConfig: row.triggerConfig ? JSON.parse(row.triggerConfig) : null,
    useWorktree: row.useWorktree === 1,
    status: row.status as Automation['status'],
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    runCount: row.runCount,
    lastRunResult: (row.lastRunResult as 'success' | 'failure' | null) ?? null,
    lastRunError: row.lastRunError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRun(row: typeof automationRunLogs.$inferSelect): AutomationRunLog {
  return {
    id: row.id,
    automationId: row.automationId,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    status: row.status as AutomationRunLog['status'],
    error: row.error,
    taskId: row.taskId,
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30);
}

export class AutomationsService {
  private scheduleTimer: NodeJS.Timeout | null = null;
  private triggerTimer: NodeJS.Timeout | null = null;
  private started = false;
  private inFlight = new Set<string>();
  private seenEvents = new Map<string, Set<string>>();

  async list(): Promise<Automation[]> {
    const rows = await db.select().from(automations).orderBy(desc(automations.updatedAt));
    return rows.map(mapAutomation);
  }

  async get(id: string): Promise<Automation | null> {
    const rows = await db.select().from(automations).where(eq(automations.id, id)).limit(1);
    return rows[0] ? mapAutomation(rows[0]) : null;
  }

  async create(input: CreateAutomationInput): Promise<Automation> {
    const now = new Date().toISOString();
    const id = `auto_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const mode = input.mode ?? 'schedule';
    const nextRunAt = mode === 'schedule' ? computeNextRun(input.schedule) : null;

    await db.insert(automations).values({
      id,
      name: input.name,
      projectId: input.projectId,
      projectName: input.projectName ?? '',
      prompt: input.prompt,
      agentId: input.agentId,
      mode,
      schedule: JSON.stringify(input.schedule),
      triggerType: input.triggerType ?? null,
      triggerConfig: input.triggerConfig ? JSON.stringify(input.triggerConfig) : null,
      useWorktree: input.useWorktree === false ? 0 : 1,
      status: 'active',
      nextRunAt,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.get(id);
    if (!created) throw new Error('Failed to load created automation');

    if (created.mode === 'trigger') {
      const events = await this.fetchRawEvents(created);
      this.seenEvents.set(created.id, new Set(events.map((e) => e.id)));
    }

    return created;
  }

  async update(input: UpdateAutomationInput): Promise<Automation> {
    const existing = await this.get(input.id);
    if (!existing) throw new Error('Automation not found');

    const mode = input.mode ?? existing.mode;
    const schedule = input.schedule ?? existing.schedule;
    const nextRunAt = mode === 'schedule' ? computeNextRun(schedule) : null;
    const triggerConfig =
      input.triggerConfig === undefined ? existing.triggerConfig : input.triggerConfig;
    const useWorktree = input.useWorktree === undefined ? existing.useWorktree : input.useWorktree;

    await db
      .update(automations)
      .set({
        name: input.name ?? existing.name,
        projectId: input.projectId ?? existing.projectId,
        projectName: input.projectName ?? existing.projectName,
        prompt: input.prompt ?? existing.prompt,
        agentId: input.agentId ?? existing.agentId,
        mode,
        schedule: JSON.stringify(schedule),
        triggerType:
          input.triggerType === undefined ? existing.triggerType : (input.triggerType ?? null),
        triggerConfig: triggerConfig ? JSON.stringify(triggerConfig) : null,
        status: input.status ?? existing.status,
        useWorktree: useWorktree ? 1 : 0,
        nextRunAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(automations.id, input.id));

    const updated = await this.get(input.id);
    if (!updated) throw new Error('Failed to load updated automation');
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await db.delete(automations).where(eq(automations.id, id));
    this.seenEvents.delete(id);
    return true;
  }

  async toggleStatus(id: string): Promise<Automation> {
    const existing = await this.get(id);
    if (!existing) throw new Error('Automation not found');
    return this.update({ id, status: existing.status === 'active' ? 'paused' : 'active' });
  }

  async getRunLogs(automationId: string, limit = 100): Promise<AutomationRunLog[]> {
    const rows = await db
      .select()
      .from(automationRunLogs)
      .where(eq(automationRunLogs.automationId, automationId))
      .orderBy(desc(automationRunLogs.startedAt))
      .limit(Math.min(Math.max(limit, 1), 500));
    return rows.map(mapRun);
  }

  async updateRunLog(
    runId: string,
    update: Partial<Pick<AutomationRunLog, 'status' | 'error' | 'finishedAt' | 'taskId'>>
  ): Promise<void> {
    await db
      .update(automationRunLogs)
      .set({
        status: update.status,
        error: update.error,
        finishedAt: update.finishedAt,
        taskId: update.taskId,
      })
      .where(eq(automationRunLogs.id, runId));
  }

  async setLastRunResult(
    automationId: string,
    result: 'success' | 'failure',
    error?: string
  ): Promise<void> {
    await db
      .update(automations)
      .set({
        lastRunResult: result,
        lastRunError: error ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(automations.id, automationId));
  }

  async createManualRunLog(automationId: string): Promise<string> {
    const runLogId = `run_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    await db.insert(automationRunLogs).values({
      id: runLogId,
      automationId,
      startedAt: now,
      status: 'running',
      taskId: null,
      error: null,
      finishedAt: null,
    });
    return runLogId;
  }

  async triggerNow(id: string): Promise<void> {
    const automation = await this.get(id);
    if (!automation) throw new Error('Automation not found');
    if (automation.mode === 'trigger') {
      throw new Error('Run now is only available for schedule automations');
    }
    await this.runAutomation(automation);
  }

  async reconcileMissedRuns(): Promise<void> {
    const nowIso = new Date().toISOString();
    await db
      .update(automationRunLogs)
      .set({ status: 'failure', error: 'Interrupted (app closed)', finishedAt: nowIso })
      .where(eq(automationRunLogs.status, 'running'));
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.scheduleTimer = setInterval(() => {
      void this.processScheduledAutomations().catch((error) => {
        log.error('[Automations] Scheduled cycle failed:', error);
      });
    }, 30_000);
    this.triggerTimer = setInterval(() => {
      void this.processTriggerAutomations().catch((error) => {
        log.error('[Automations] Trigger cycle failed:', error);
      });
    }, 10_000);
    void this.processScheduledAutomations().catch((error) => {
      log.error('[Automations] Initial scheduled cycle failed:', error);
    });
    setTimeout(() => {
      void this.processTriggerAutomations().catch((error) => {
        log.error('[Automations] Initial trigger cycle failed:', error);
      });
    }, 2_000);
  }

  stop(): void {
    this.started = false;
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
    if (this.triggerTimer) clearInterval(this.triggerTimer);
    this.scheduleTimer = null;
    this.triggerTimer = null;
  }

  private async processScheduledAutomations(): Promise<void> {
    const now = new Date();
    const nowIso = now.toISOString();
    const due = await db
      .select()
      .from(automations)
      .where(
        and(
          eq(automations.status, 'active'),
          eq(automations.mode, 'schedule'),
          lte(automations.nextRunAt, nowIso)
        )
      );

    for (const row of due) {
      const automation = mapAutomation(row);
      if (this.inFlight.has(automation.id)) continue;
      void this.runAutomation(automation);
    }
  }

  private async processTriggerAutomations(): Promise<void> {
    const rows = await db
      .select()
      .from(automations)
      .where(and(eq(automations.status, 'active'), eq(automations.mode, 'trigger')));

    // Per-cycle dedup: multiple automations on the same source (e.g. several
    // GitHub Issue Triages on the same repo) share a single upstream fetch.
    const fetchCache = new Map<string, Promise<RawEvent[]>>();
    const cacheKey = (automation: Automation) =>
      `${automation.triggerType ?? 'none'}:${automation.projectId}`;

    for (const row of rows) {
      const automation = mapAutomation(row);
      const key = cacheKey(automation);
      let pending = fetchCache.get(key);
      if (!pending) {
        pending = this.fetchRawEvents(automation);
        fetchCache.set(key, pending);
      }
      const events = await pending;

      // Don't wipe seen state on transient empty fetches (auth blip, rate limit,
      // network error). An empty result set is treated as "no signal", not "no
      // events exist". Without this guard, the next successful fetch would
      // re-fire every existing event.
      if (events.length === 0) {
        if (!this.seenEvents.has(automation.id)) {
          this.seenEvents.set(automation.id, new Set());
        }
        continue;
      }

      const seen = this.seenEvents.get(automation.id) ?? new Set<string>();
      const isFirstObservation = !this.seenEvents.has(automation.id);
      // Baseline timestamp: anything strictly newer than the automation's
      // creation time is a candidate, even on the first poll after restart.
      // This closes the gap where new events arriving between app start and
      // the first poll would otherwise be silently absorbed into `seen`.
      const baseline = Date.parse(automation.createdAt);

      const fresh = events.filter((event) => {
        if (seen.has(event.id)) return false;
        if (isFirstObservation) {
          // On the very first observation for this automation in this process,
          // only fire events whose createdAt is after the automation itself.
          // If we have no timestamp, fall back to NOT firing to avoid spam.
          if (!event.createdAt) return false;
          const ts = Date.parse(event.createdAt);
          if (!Number.isFinite(ts) || ts <= baseline) return false;
        }
        return this.matchesConfig(automation, event);
      });

      for (const event of fresh.slice(0, 3)) {
        if (!this.inFlight.has(automation.id)) {
          void this.runAutomation(automation, event);
        }
      }
      // Replace the seen set with only the current window — bounded by the
      // upstream `fetchRawEvents` page size (~30) so memory can't grow unbounded.
      this.seenEvents.set(automation.id, new Set(events.map((e) => e.id)));
    }
  }

  private matchesConfig(automation: Automation, event: RawEvent): boolean {
    const config = automation.triggerConfig;
    if (!config) return true;

    if (config.labelFilter?.length) {
      const labels = event.labels ?? [];
      const match = config.labelFilter.some((wanted) =>
        labels.some((candidate) => candidate.toLowerCase() === wanted.toLowerCase())
      );
      if (!match) return false;
    }

    if (config.assigneeFilter) {
      if (!event.assignee) return false;
      if (event.assignee.toLowerCase() !== config.assigneeFilter.toLowerCase()) return false;
    }

    if (config.branchFilter) {
      if (!event.branch) return false;
      if (config.branchFilter.includes('*')) {
        const escaped = config.branchFilter
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*');
        if (!new RegExp(`^${escaped}$`).test(event.branch)) return false;
      } else if (event.branch !== config.branchFilter) {
        return false;
      }
    }

    return true;
  }

  private async resolveGitRemoteUrl(projectId: string): Promise<string | null> {
    try {
      let provider = projectManager.getProject(projectId);
      if (!provider) {
        // Provider may not be initialized yet (the trigger poll fires 2s after
        // startup, but project bootstrap can take longer). Open it on demand.
        try {
          await projectManager.openProjectById(projectId);
        } catch (openErr) {
          log.error(
            `[Automations] Could not open project ${projectId} to resolve remote:`,
            openErr
          );
          return null;
        }
        provider = projectManager.getProject(projectId);
        if (!provider) {
          log.error(
            `[Automations] Project ${projectId} provider unavailable after openProjectById`
          );
          return null;
        }
      }
      const state = await provider.getRemoteState();
      if (!state.selectedRemoteUrl) {
        log.error(
          `[Automations] Project ${projectId} has no selected remote URL (hasRemote=${state.hasRemote})`
        );
        return null;
      }
      return state.selectedRemoteUrl;
    } catch (error) {
      log.error(`[Automations] Failed to resolve remote for project ${projectId}:`, error);
      return null;
    }
  }

  private async fetchRawEvents(automation: Automation): Promise<RawEvent[]> {
    if (!automation.triggerType) return [];

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, automation.projectId),
    });
    if (!project) return [];

    switch (automation.triggerType) {
      case 'github_issue': {
        const remoteUrl = await this.resolveGitRemoteUrl(project.id);
        return this.fetchGitHubIssues(remoteUrl);
      }
      case 'github_pr': {
        const remoteUrl = await this.resolveGitRemoteUrl(project.id);
        return this.fetchGitHubPullRequests(project.id, remoteUrl);
      }
      case 'linear_issue':
        return this.fetchLinearIssues();
      case 'jira_issue':
        return this.fetchJiraIssues();
      case 'gitlab_issue':
        return this.fetchGitLabIssues(project.path);
      case 'gitlab_mr':
        return this.fetchGitLabMergeRequests(project.path);
      case 'forgejo_issue':
        return this.fetchForgejoIssues(project.path);
      case 'plain_thread':
        return this.fetchPlainThreads();
      case 'sentry_issue':
        return [];
      default:
        return [];
    }
  }

  private async fetchGitHubIssues(remote: string | null): Promise<RawEvent[]> {
    const nameWithOwner = parseNameWithOwner(remote);
    if (!nameWithOwner) return [];
    const issues = await issueService.listIssues(nameWithOwner, 30);
    return issues.map((issue) => ({
      id: `gh-issue-${issue.number}`,
      title: issue.title,
      url: issue.url,
      labels: issue.labels.map((l) => l.name),
      assignee: issue.assignees[0]?.login,
      createdAt: issue.createdAt ?? undefined,
    }));
  }

  private async fetchGitHubPullRequests(
    projectId: string,
    remote: string | null
  ): Promise<RawEvent[]> {
    const nameWithOwner = parseNameWithOwner(remote);
    if (!nameWithOwner) return [];
    const { prs } = await prService.listPullRequests(projectId, nameWithOwner);
    return prs.slice(0, 30).map((pr) => ({
      id: `gh-pr-${pr.id}`,
      title: pr.title,
      url: pr.url,
      labels: pr.labels.map((l) => l.name),
      assignee: pr.assignees[0]?.userName,
      branch: pr.metadata.headRefName,
    }));
  }

  private async fetchLinearIssues(): Promise<RawEvent[]> {
    const status = await linearService.checkConnection();
    if (!status.connected) return [];
    const issues = await linearService.initialFetch(30);
    return issues.map((issue) => ({
      id: `linear-${issue.id}`,
      title: issue.title,
      url: issue.url,
      assignee: issue.assignee?.name ?? issue.assignee?.displayName ?? undefined,
    }));
  }

  private async fetchJiraIssues(): Promise<RawEvent[]> {
    const jira = new JiraService();
    const status = await jira.checkConnection();
    if (!status.connected) return [];
    const issues = await jira.initialFetch(30);
    return issues.map((issue) => ({
      id: `jira-${issue.id}`,
      title: issue.summary,
      url: issue.url,
      assignee: issue.assignee?.name,
    }));
  }

  private async fetchGitLabIssues(projectPath: string): Promise<RawEvent[]> {
    const status = await gitlabService.checkConnection();
    if (!status.connected) return [];
    const issues = await gitlabService.initialFetch(projectPath, 30);
    return issues.map((issue) => ({
      id: `gitlab-issue-${issue.id}`,
      title: issue.title,
      url: issue.webUrl ?? undefined,
      labels: issue.labels,
      assignee: issue.assignee?.username,
    }));
  }

  private async fetchGitLabMergeRequests(projectPath: string): Promise<RawEvent[]> {
    const status = await gitlabService.checkConnection();
    if (!status.connected) return [];
    const mrs = await gitlabService.initialFetchMergeRequests(projectPath, 30);
    return mrs.map((mr) => ({
      id: `gitlab-mr-${mr.id}`,
      title: mr.title,
      url: mr.webUrl ?? undefined,
      labels: mr.labels,
      branch: mr.sourceBranch ?? undefined,
      assignee: mr.assignee?.username,
    }));
  }

  private async fetchForgejoIssues(projectPath: string): Promise<RawEvent[]> {
    const status = await forgejoService.checkConnection();
    if (!status.connected) return [];
    const issues = await forgejoService.initialFetch(projectPath, 30);
    return issues.map((issue) => ({
      id: `forgejo-${issue.id}`,
      title: issue.title,
      url: issue.htmlUrl ?? undefined,
      labels: issue.labels,
      assignee: issue.assignee?.username,
    }));
  }

  private async fetchPlainThreads(): Promise<RawEvent[]> {
    const status = await plainService.checkConnection();
    if (!status.connected) return [];
    const threads = await plainService.initialFetch(30);
    return threads.map((thread) => ({
      id: `plain-${thread.id}`,
      title: thread.title,
      url: thread.url ?? undefined,
    }));
  }

  async runAutomation(automation: Automation, triggerEvent?: RawEvent): Promise<void> {
    if (this.inFlight.has(automation.id)) return;
    this.inFlight.add(automation.id);

    const runId = await this.createManualRunLog(automation.id);
    const nowIso = new Date().toISOString();

    try {
      const project = await db.query.projects.findFirst({
        where: eq(projects.id, automation.projectId),
      });
      if (!project) throw new Error(`Project not found: ${automation.projectId}`);
      if (!isValidProviderId(automation.agentId))
        throw new Error(`Invalid agent: ${automation.agentId}`);

      const baseBranch = project.baseRef || 'main';
      const branchBase = `${slug(automation.name)}-${new Date().toISOString().slice(0, 10)}`;

      const taskId = crypto.randomUUID();
      const taskResult = await createTask({
        id: taskId,
        projectId: automation.projectId,
        name: triggerEvent ? `${automation.name}: ${triggerEvent.title}` : automation.name,
        sourceBranch: { branch: baseBranch, remote: 'origin' },
        strategy: automation.useWorktree
          ? { kind: 'new-branch', taskBranch: branchBase }
          : { kind: 'no-worktree' },
        initialConversation: {
          id: crypto.randomUUID(),
          projectId: automation.projectId,
          taskId,
          provider: automation.agentId as AgentProviderId,
          title: automation.name,
          initialPrompt: triggerEvent
            ? `${automation.prompt}\n\nTrigger context:\n- ${triggerEvent.title}\n${triggerEvent.url ?? ''}`
            : automation.prompt,
        },
      });

      if (!taskResult.success) {
        throw new Error(taskResult.error.type);
      }

      await this.updateRunLog(runId, {
        status: 'success',
        finishedAt: new Date().toISOString(),
        taskId: taskResult.data.id,
      });

      events.emit(taskCreatedExternallyChannel, {
        projectId: automation.projectId,
        taskId: taskResult.data.id,
      });

      await db
        .update(automations)
        .set({
          runCount: automation.runCount + 1,
          lastRunAt: nowIso,
          nextRunAt: automation.mode === 'schedule' ? computeNextRun(automation.schedule) : null,
          lastRunResult: 'success',
          lastRunError: null,
          updatedAt: nowIso,
        })
        .where(eq(automations.id, automation.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[Automations] Run failed (${automation.id}):`, error);
      await this.updateRunLog(runId, {
        status: 'failure',
        finishedAt: new Date().toISOString(),
        error: message,
      });
      await db
        .update(automations)
        .set({
          nextRunAt: automation.mode === 'schedule' ? computeNextRun(automation.schedule) : null,
          lastRunResult: 'failure',
          lastRunError: message,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(automations.id, automation.id));
    } finally {
      this.inFlight.delete(automation.id);
    }
  }
}

export const automationsService = new AutomationsService();
