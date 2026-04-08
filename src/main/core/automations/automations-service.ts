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
import { forgejoService } from '@main/core/forgejo/forgejo-service';
import { issueService } from '@main/core/github/services/issue-service';
import { gitlabService } from '@main/core/gitlab/gitlab-service';
import JiraService from '@main/core/jira/JiraService';
import { linearService } from '@main/core/linear/LinearService';
import { plainService } from '@main/core/plain/plain-service';
import { prService } from '@main/core/pull-requests/pr-service';
import { createTask } from '@main/core/tasks/createTask';
import { db, sqlite } from '@main/db/client';
import { automationRunLogs, automations, projects } from '@main/db/schema';
import { log } from '@main/lib/logger';

type RawEvent = {
  id: string;
  title: string;
  url?: string;
  labels?: string[];
  assignee?: string;
  branch?: string;
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
  private initialized = false;
  private inFlight = new Set<string>();
  private seenEvents = new Map<string, Set<string>>();

  private async ensureTables(): Promise<void> {
    if (this.initialized) return;
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS automations (
        id text PRIMARY KEY NOT NULL,
        project_id text NOT NULL,
        project_name text DEFAULT '' NOT NULL,
        name text NOT NULL,
        prompt text NOT NULL,
        agent_id text NOT NULL,
        mode text DEFAULT 'schedule' NOT NULL,
        schedule text NOT NULL,
        trigger_type text,
        trigger_config text,
        use_worktree integer DEFAULT 1 NOT NULL,
        status text DEFAULT 'active' NOT NULL,
        last_run_at text,
        next_run_at text,
        run_count integer DEFAULT 0 NOT NULL,
        last_run_result text,
        last_run_error text,
        created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_automations_project_id ON automations (project_id);
      CREATE INDEX IF NOT EXISTS idx_automations_status_next_run ON automations (status, next_run_at);

      CREATE TABLE IF NOT EXISTS automation_run_logs (
        id text PRIMARY KEY NOT NULL,
        automation_id text NOT NULL,
        started_at text NOT NULL,
        finished_at text,
        status text NOT NULL,
        error text,
        task_id text,
        FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_automation_run_logs_automation_started ON automation_run_logs (automation_id, started_at);
    `);

    // Backfill schema for users with older local tables.
    const hasColumn = (table: string, column: string): boolean => {
      const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      return rows.some((r) => r.name === column);
    };

    const addColumnIfMissing = (table: string, column: string, ddl: string): void => {
      if (!hasColumn(table, column)) {
        sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
      }
    };

    addColumnIfMissing('automations', 'mode', `mode text DEFAULT 'schedule' NOT NULL`);
    addColumnIfMissing('automations', 'trigger_type', 'trigger_type text');
    addColumnIfMissing('automations', 'trigger_config', 'trigger_config text');
    addColumnIfMissing('automations', 'use_worktree', 'use_worktree integer DEFAULT 1 NOT NULL');
    addColumnIfMissing('automations', 'last_run_result', 'last_run_result text');
    addColumnIfMissing('automations', 'last_run_error', 'last_run_error text');

    this.initialized = true;
  }

  async list(): Promise<Automation[]> {
    await this.ensureTables();
    const rows = await db.select().from(automations).orderBy(desc(automations.updatedAt));
    return rows.map(mapAutomation);
  }

  async get(id: string): Promise<Automation | null> {
    await this.ensureTables();
    const rows = await db.select().from(automations).where(eq(automations.id, id)).limit(1);
    return rows[0] ? mapAutomation(rows[0]) : null;
  }

  async create(input: CreateAutomationInput): Promise<Automation> {
    await this.ensureTables();
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
    await this.ensureTables();
    const existing = await this.get(input.id);
    if (!existing) throw new Error('Automation not found');

    const mode = input.mode ?? existing.mode;
    const schedule = input.schedule ?? existing.schedule;
    const nextRunAt = mode === 'schedule' ? computeNextRun(schedule) : null;

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
        triggerConfig:
          input.triggerConfig === undefined
            ? existing.triggerConfig
              ? JSON.stringify(existing.triggerConfig)
              : null
            : input.triggerConfig
              ? JSON.stringify(input.triggerConfig)
              : null,
        status: input.status ?? existing.status,
        useWorktree:
          input.useWorktree === undefined
            ? existing.useWorktree
              ? 1
              : 0
            : input.useWorktree
              ? 1
              : 0,
        nextRunAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(automations.id, input.id));

    const updated = await this.get(input.id);
    if (!updated) throw new Error('Failed to load updated automation');
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    await this.ensureTables();
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
    await this.ensureTables();
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
    await this.ensureTables();
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
    await this.ensureTables();
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
    }, 60_000);
    void this.processScheduledAutomations().catch((error) => {
      log.error('[Automations] Initial scheduled cycle failed:', error);
    });
    void this.processTriggerAutomations().catch((error) => {
      log.error('[Automations] Initial trigger cycle failed:', error);
    });
  }

  stop(): void {
    this.started = false;
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
    if (this.triggerTimer) clearInterval(this.triggerTimer);
    this.scheduleTimer = null;
    this.triggerTimer = null;
  }

  private async processScheduledAutomations(): Promise<void> {
    await this.ensureTables();
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
    await this.ensureTables();
    const rows = await db
      .select()
      .from(automations)
      .where(and(eq(automations.status, 'active'), eq(automations.mode, 'trigger')));

    for (const row of rows) {
      const automation = mapAutomation(row);
      const events = await this.fetchRawEvents(automation);
      const seen = this.seenEvents.get(automation.id) ?? new Set<string>();
      if (!this.seenEvents.has(automation.id)) this.seenEvents.set(automation.id, seen);

      const fresh = events.filter(
        (event) => !seen.has(event.id) && this.matchesConfig(automation, event)
      );
      for (const event of fresh.slice(0, 3)) {
        seen.add(event.id);
        if (!this.inFlight.has(automation.id)) {
          void this.runAutomation(automation, event);
        }
      }
      for (const event of events) seen.add(event.id);
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

  private async fetchRawEvents(automation: Automation): Promise<RawEvent[]> {
    if (!automation.triggerType) return [];

    const project = await db.query.projects.findFirst({
      where: eq(projects.id, automation.projectId),
    });
    if (!project) return [];

    switch (automation.triggerType) {
      case 'github_issue':
        return this.fetchGitHubIssues(project.gitRemote);
      case 'github_pr':
        return this.fetchGitHubPullRequests(project.id, project.gitRemote);
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

      const remote = project.gitRemote ? 'origin' : 'origin';
      const baseBranch = project.baseRef || 'main';
      const branchBase = `${slug(automation.name)}-${new Date().toISOString().slice(0, 10)}`;

      const taskId = crypto.randomUUID();
      const taskResult = await createTask({
        id: taskId,
        projectId: automation.projectId,
        name: triggerEvent ? `${automation.name}: ${triggerEvent.title}` : automation.name,
        sourceBranch: { branch: baseBranch, remote },
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
