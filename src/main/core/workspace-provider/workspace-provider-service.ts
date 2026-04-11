import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import {
  workspaceProvisionCompleteChannel,
  workspaceProvisionProgressChannel,
  workspaceProvisionTimeoutWarningChannel,
} from '@shared/events/workspaceProviderEvents';
import { resolveSshAlias } from '@main/core/ssh/sshConfigParser';
import { db } from '@main/db/client';
import {
  sshConnections,
  tasks,
  workspaceInstances,
  type SshConnectionInsert,
  type WorkspaceInstanceRow,
} from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { parseProvisionOutput, type ProvisionOutput } from './parse-provision-output';

export interface ProvisionParams {
  taskId: string;
  repoUrl: string;
  branch: string;
  baseRef: string;
  provisionCommand: string;
  projectPath: string;
}

export interface TerminateParams {
  instanceId: string;
  terminateCommand: string;
  projectPath: string;
}

const TIMEOUT_WARNING_MS = 5 * 60 * 1000; // 5 minutes
const TERMINATE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

/** Active child processes, keyed by instanceId. */
const activeProcesses = new Map<string, ChildProcess>();

export async function provision(params: ProvisionParams): Promise<{ instanceId: string }> {
  const instanceId = randomUUID();

  // Insert workspace instance row
  await db.insert(workspaceInstances).values({
    id: instanceId,
    taskId: params.taskId,
    host: '', // will be updated after provision completes
    status: 'provisioning',
  });

  // Link instance to task
  await db
    .update(tasks)
    .set({ workspaceInstanceId: instanceId })
    .where(eq(tasks.id, params.taskId));

  // Run provision in background
  runProvision(instanceId, params).catch((e) => {
    log.error('workspace-provider: provision background error', { instanceId, error: String(e) });
  });

  return { instanceId };
}

async function runProvision(instanceId: string, params: ProvisionParams): Promise<void> {
  const env: Record<string, string> = {
    ...process.env,
    EMDASH_TASK_ID: params.taskId,
    EMDASH_REPO_URL: params.repoUrl,
    EMDASH_BRANCH: params.branch,
    EMDASH_BASE_REF: params.baseRef,
  };

  const child = spawn('bash', ['-c', params.provisionCommand], {
    cwd: params.projectPath,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  activeProcesses.set(instanceId, child);

  let stdout = '';
  const stderrLines: string[] = [];

  child.stdout?.on('data', (data: Buffer) => {
    stdout += data.toString();
  });

  child.stderr?.on('data', (data: Buffer) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      stderrLines.push(line);
      events.emit(workspaceProvisionProgressChannel, { instanceId, line });
    }
  });

  // Timeout warning at 5 minutes (does not kill process)
  const timeoutWarning = setTimeout(() => {
    events.emit(workspaceProvisionTimeoutWarningChannel, {
      instanceId,
      timeoutMs: TIMEOUT_WARNING_MS,
    });
  }, TIMEOUT_WARNING_MS);

  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on('close', (code) => resolve(code));
      child.on('error', (err) => reject(err));
    });

    clearTimeout(timeoutWarning);
    activeProcesses.delete(instanceId);

    if (exitCode !== 0) {
      const lastStderr = stderrLines.slice(-5).join('\n');
      const errorMsg = `Provision script exited with code ${exitCode}. ${lastStderr}`.trim();
      await markError(instanceId, errorMsg);
      return;
    }

    // Parse stdout JSON
    const parseResult = parseProvisionOutput(stdout);
    if (!parseResult.success) {
      await markError(instanceId, parseResult.error.message);
      return;
    }

    await completeProvision(instanceId, params.taskId, parseResult.data);
  } catch (e) {
    clearTimeout(timeoutWarning);
    activeProcesses.delete(instanceId);
    await markError(instanceId, e instanceof Error ? e.message : String(e));
  }
}

async function completeProvision(
  instanceId: string,
  taskId: string,
  output: ProvisionOutput
): Promise<void> {
  // Resolve SSH alias if the host is a config alias
  const alias = await resolveSshAlias(output.host);
  const resolvedHost = alias?.hostname ?? output.host;
  const resolvedPort = output.port ?? alias?.port ?? 22;
  const resolvedUsername = output.username ?? alias?.user ?? process.env.USER ?? 'root';

  // Create SSH connection row
  const connectionId = randomUUID();
  const sshInsert: SshConnectionInsert = {
    id: connectionId,
    name: `workspace-${instanceId.slice(0, 8)}`,
    host: resolvedHost,
    port: resolvedPort,
    username: resolvedUsername,
    authType: alias?.identityFile ? 'key' : 'agent',
    privateKeyPath: alias?.identityFile ?? null,
    useAgent: alias?.identityFile ? 0 : 1,
  };
  await db.insert(sshConnections).values(sshInsert);

  // Update workspace instance to ready
  await db
    .update(workspaceInstances)
    .set({
      host: resolvedHost,
      port: resolvedPort,
      username: resolvedUsername,
      externalId: output.id ?? null,
      worktreePath: output.worktreePath ?? null,
      connectionId,
      status: 'ready',
    })
    .where(eq(workspaceInstances.id, instanceId));

  events.emit(workspaceProvisionCompleteChannel, { instanceId, status: 'ready' });
  log.info('workspace-provider: provision complete', { instanceId, host: resolvedHost });
}

async function markError(instanceId: string, errorMsg: string): Promise<void> {
  await db
    .update(workspaceInstances)
    .set({ status: 'error' })
    .where(eq(workspaceInstances.id, instanceId));

  events.emit(workspaceProvisionCompleteChannel, {
    instanceId,
    status: 'error',
    error: errorMsg,
  });
  log.warn('workspace-provider: provision failed', { instanceId, error: errorMsg });
}

export async function cancel(instanceId: string): Promise<void> {
  const child = activeProcesses.get(instanceId);
  if (child) {
    child.kill('SIGTERM');
    activeProcesses.delete(instanceId);
  }

  await db
    .update(workspaceInstances)
    .set({ status: 'error' })
    .where(eq(workspaceInstances.id, instanceId));

  events.emit(workspaceProvisionCompleteChannel, {
    instanceId,
    status: 'error',
    error: 'Cancelled by user',
  });
}

export async function terminate(params: TerminateParams): Promise<void> {
  const [instance] = await db
    .select()
    .from(workspaceInstances)
    .where(eq(workspaceInstances.id, params.instanceId))
    .limit(1);

  if (!instance) {
    throw new Error(`Workspace instance not found: ${params.instanceId}`);
  }

  const env: Record<string, string> = {
    ...process.env,
    EMDASH_INSTANCE_ID: instance.externalId ?? instance.host,
    EMDASH_TASK_ID: instance.taskId,
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('bash', ['-c', params.terminateCommand], {
        cwd: params.projectPath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: TERMINATE_TIMEOUT_MS,
      });

      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Terminate script exited with code ${code}`));
      });
      child.on('error', reject);
    });
  } catch (e) {
    log.warn('workspace-provider: terminate script failed', {
      instanceId: params.instanceId,
      error: String(e),
    });
  }

  // Mark as terminated regardless of script outcome
  await db
    .update(workspaceInstances)
    .set({
      status: 'terminated',
      terminatedAt: new Date().toISOString(),
    })
    .where(eq(workspaceInstances.id, params.instanceId));

  // Clean up SSH connection
  if (instance.connectionId) {
    await db
      .delete(sshConnections)
      .where(eq(sshConnections.id, instance.connectionId))
      .catch((e) => {
        log.warn('workspace-provider: SSH connection cleanup failed', { error: String(e) });
      });
  }
}

export async function getActiveInstance(taskId: string): Promise<WorkspaceInstanceRow | null> {
  const [row] = await db
    .select()
    .from(workspaceInstances)
    .where(
      and(
        eq(workspaceInstances.taskId, taskId),
        inArray(workspaceInstances.status, ['provisioning', 'ready', 'error'])
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getInstance(instanceId: string): Promise<WorkspaceInstanceRow | null> {
  const [row] = await db
    .select()
    .from(workspaceInstances)
    .where(eq(workspaceInstances.id, instanceId))
    .limit(1);
  return row ?? null;
}

/**
 * Marks stale `provisioning` instances as `error` on startup.
 * Child processes don't survive app restart, so any provisioning row
 * left over from a previous session is stale.
 */
export async function reconcileOnStartup(): Promise<void> {
  const updated = await db
    .update(workspaceInstances)
    .set({ status: 'error' })
    .where(eq(workspaceInstances.status, 'provisioning'))
    .returning();

  if (updated.length > 0) {
    log.info(`workspace-provider: reconciled ${updated.length} stale provisioning instance(s)`);
  }
}
