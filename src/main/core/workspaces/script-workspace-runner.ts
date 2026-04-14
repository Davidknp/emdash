import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  workspaceProvisionProgressChannel,
  workspaceProvisionStatusChannel,
  workspaceProvisionTimeoutWarningChannel,
} from '@shared/events/workspaceProviderEvents';
import type { WorkspaceInstance } from '@shared/tasks';
import type { ProjectSettings } from '@main/core/projects/settings/schema';
import { db } from '@main/db/client';
import { workspaceInstances } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { parseProvisionOutput } from './parse-provision-output';

const PROVISION_TIMEOUT_WARNING_MS = 5 * 60 * 1000; // 5 minutes
const TERMINATE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const MAX_STDERR_LINES = 200;

type ProvisionArgs = {
  taskId: string;
  projectPath: string;
  projectSettings: ProjectSettings;
  remoteUrl: string | null;
  branch: string | null;
  baseRef: string;
};

type TerminateArgs = {
  taskId: string;
  projectPath: string;
  projectSettings: ProjectSettings;
};

// Track in-flight provisioning processes so we can cancel them
const activeProvisions = new Map<string, ChildProcess>();

function rowToWorkspaceInstance(row: typeof workspaceInstances.$inferSelect): WorkspaceInstance {
  return {
    id: row.id,
    taskId: row.taskId,
    status: row.status as WorkspaceInstance['status'],
    host: row.host,
    port: row.port,
    username: row.username,
    worktreePath: row.worktreePath,
    externalId: row.externalId,
    errorMessage: row.errorMessage,
    stderrLog: row.stderrLog,
    createdAt: row.createdAt,
    readyAt: row.readyAt,
    terminatedAt: row.terminatedAt,
  };
}

export async function provision(args: ProvisionArgs): Promise<WorkspaceInstance> {
  const { taskId, projectPath, projectSettings, remoteUrl, branch, baseRef } = args;
  const config = projectSettings.workspaceProvider;

  if (!config) {
    throw new Error('No workspaceProvider configured in project settings');
  }

  const instanceId = randomUUID();

  // Insert initial row
  const [row] = await db
    .insert(workspaceInstances)
    .values({
      id: instanceId,
      taskId,
      status: 'provisioning',
    })
    .returning();

  events.emit(workspaceProvisionStatusChannel, { taskId, status: 'provisioning' }, taskId);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    EMDASH_TASK_ID: taskId,
    EMDASH_BRANCH: branch ?? '',
    EMDASH_BASE_REF: baseRef,
  };
  if (remoteUrl) {
    env.EMDASH_REPO_URL = remoteUrl;
  }

  return new Promise<WorkspaceInstance>((resolve, reject) => {
    const child = spawn('bash', ['-c', config.provisionCommand], {
      cwd: projectPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    activeProvisions.set(taskId, child);

    const stderrLines: string[] = [];
    const stdoutChunks: string[] = [];

    // Timeout warning
    const timeoutWarning = setTimeout(() => {
      events.emit(
        workspaceProvisionTimeoutWarningChannel,
        { taskId, elapsedMs: PROVISION_TIMEOUT_WARNING_MS },
        taskId
      );
    }, PROVISION_TIMEOUT_WARNING_MS);

    child.stdout!.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk.toString());
    });

    child.stderr!.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        stderrLines.push(line);
        if (stderrLines.length > MAX_STDERR_LINES) {
          stderrLines.shift();
        }
        events.emit(workspaceProvisionProgressChannel, { taskId, line }, taskId);
      }
    });

    child.on('error', async (error) => {
      clearTimeout(timeoutWarning);
      activeProvisions.delete(taskId);
      const errorMessage = `Failed to start provisioner: ${error.message}`;
      const stderrTail = stderrLines.join('\n');

      await db
        .update(workspaceInstances)
        .set({ status: 'error', errorMessage, stderrLog: stderrTail })
        .where(eq(workspaceInstances.id, instanceId));

      events.emit(
        workspaceProvisionStatusChannel,
        { taskId, status: 'error', errorMessage },
        taskId
      );

      reject(new Error(errorMessage));
    });

    child.on('close', async (code) => {
      clearTimeout(timeoutWarning);
      activeProvisions.delete(taskId);
      const stderrTail = stderrLines.join('\n');

      if (code !== 0) {
        const errorMessage = `Provisioner exited with code ${code}`;
        await db
          .update(workspaceInstances)
          .set({ status: 'error', errorMessage, stderrLog: stderrTail })
          .where(eq(workspaceInstances.id, instanceId));

        events.emit(
          workspaceProvisionStatusChannel,
          { taskId, status: 'error', errorMessage },
          taskId
        );

        reject(new Error(errorMessage));
        return;
      }

      const stdout = stdoutChunks.join('');
      const parseResult = parseProvisionOutput(stdout);

      if (!parseResult.success) {
        const errorMessage = parseResult.error.message;
        await db
          .update(workspaceInstances)
          .set({ status: 'error', errorMessage, stderrLog: stderrTail })
          .where(eq(workspaceInstances.id, instanceId));

        events.emit(
          workspaceProvisionStatusChannel,
          { taskId, status: 'error', errorMessage },
          taskId
        );

        reject(new Error(errorMessage));
        return;
      }

      const output = parseResult.data;

      await db
        .update(workspaceInstances)
        .set({
          status: 'ready',
          host: output.host,
          port: output.port ?? 22,
          username: output.username ?? null,
          worktreePath: output.worktreePath ?? null,
          externalId: output.id ?? null,
          stderrLog: stderrTail,
          readyAt: new Date().toISOString(),
        })
        .where(eq(workspaceInstances.id, instanceId));

      events.emit(workspaceProvisionStatusChannel, { taskId, status: 'ready' }, taskId);

      const [updatedRow] = await db
        .select()
        .from(workspaceInstances)
        .where(eq(workspaceInstances.id, instanceId));

      resolve(rowToWorkspaceInstance(updatedRow));
    });
  });
}

export async function cancel(taskId: string): Promise<void> {
  const child = activeProvisions.get(taskId);
  if (child) {
    child.kill('SIGTERM');
    activeProvisions.delete(taskId);
  }

  // Mark the instance as error
  const [instance] = await db
    .select()
    .from(workspaceInstances)
    .where(eq(workspaceInstances.taskId, taskId));

  if (instance && instance.status === 'provisioning') {
    await db
      .update(workspaceInstances)
      .set({ status: 'error', errorMessage: 'Provisioning cancelled by user' })
      .where(eq(workspaceInstances.id, instance.id));

    events.emit(
      workspaceProvisionStatusChannel,
      { taskId, status: 'error', errorMessage: 'Provisioning cancelled by user' },
      taskId
    );
  }
}

export async function terminate(args: TerminateArgs): Promise<void> {
  const { taskId, projectPath, projectSettings } = args;
  const config = projectSettings.workspaceProvider;

  if (!config) return;

  const [instance] = await db
    .select()
    .from(workspaceInstances)
    .where(eq(workspaceInstances.taskId, taskId));

  if (!instance || instance.status === 'terminated') return;

  // Mark as terminating
  await db
    .update(workspaceInstances)
    .set({ status: 'terminating' })
    .where(eq(workspaceInstances.id, instance.id));

  events.emit(workspaceProvisionStatusChannel, { taskId, status: 'terminating' }, taskId);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    EMDASH_INSTANCE_ID: instance.externalId ?? instance.host ?? '',
    EMDASH_TASK_ID: taskId,
  };

  return new Promise<void>((resolve) => {
    const child = spawn('bash', ['-c', config.terminateCommand], {
      cwd: projectPath,
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    const timeout = setTimeout(() => {
      log.warn('ScriptWorkspaceRunner: terminate timed out, killing process', { taskId });
      child.kill('SIGKILL');
    }, TERMINATE_TIMEOUT_MS);

    child.on('close', async (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        log.warn('ScriptWorkspaceRunner: terminate exited with non-zero code', { taskId, code });
      }

      await db
        .update(workspaceInstances)
        .set({ status: 'terminated', terminatedAt: new Date().toISOString() })
        .where(eq(workspaceInstances.id, instance.id));

      events.emit(workspaceProvisionStatusChannel, { taskId, status: 'terminated' }, taskId);

      resolve();
    });

    child.on('error', async (error) => {
      clearTimeout(timeout);
      log.warn('ScriptWorkspaceRunner: terminate failed to start', {
        taskId,
        error: error.message,
      });

      await db
        .update(workspaceInstances)
        .set({ status: 'terminated', terminatedAt: new Date().toISOString() })
        .where(eq(workspaceInstances.id, instance.id));

      resolve();
    });
  });
}

export async function getInstance(taskId: string): Promise<WorkspaceInstance | null> {
  const [row] = await db
    .select()
    .from(workspaceInstances)
    .where(eq(workspaceInstances.taskId, taskId));

  return row ? rowToWorkspaceInstance(row) : null;
}

export async function reconcileOnStartup(): Promise<void> {
  // Mark any in-flight provisioning instances as error (child process is dead after restart)
  const staleRows = await db
    .select()
    .from(workspaceInstances)
    .where(eq(workspaceInstances.status, 'provisioning'));

  for (const row of staleRows) {
    log.info('ScriptWorkspaceRunner: marking stale provisioning instance as error on startup', {
      instanceId: row.id,
      taskId: row.taskId,
    });

    await db
      .update(workspaceInstances)
      .set({
        status: 'error',
        errorMessage: 'App restarted during provisioning',
      })
      .where(eq(workspaceInstances.id, row.id));
  }

  // Also mark terminating instances as terminated (best-effort)
  const terminatingRows = await db
    .select()
    .from(workspaceInstances)
    .where(eq(workspaceInstances.status, 'terminating'));

  for (const row of terminatingRows) {
    await db
      .update(workspaceInstances)
      .set({
        status: 'terminated',
        terminatedAt: new Date().toISOString(),
      })
      .where(eq(workspaceInstances.id, row.id));
  }
}
