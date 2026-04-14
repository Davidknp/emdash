import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { getTaskEnvVars } from '@shared/task/envVars';
import { workspaceKey } from '@shared/workspace-key';
import { SshConversationProvider } from '@main/core/conversations/impl/ssh-conversation';
import { mapConversationRowToConversation } from '@main/core/conversations/utils';
import { LocalProjectProvider } from '@main/core/projects/impl/local-project-provider';
import { projectManager } from '@main/core/projects/project-manager';
import type { TaskProvider } from '@main/core/projects/project-provider';
import { sshConnectionManager } from '@main/core/ssh/ssh-connection-manager';
import { mapTerminalRowToTerminal } from '@main/core/terminals/core';
import { SshTerminalProvider } from '@main/core/terminals/impl/ssh-terminal-provider';
import { getSshExec } from '@main/core/utils/exec';
import { getInstance } from '@main/core/workspaces/script-workspace-runner';
import { db } from '@main/db/client';
import { conversations, sshConnections, tasks, terminals } from '@main/db/schema';
import { log } from '@main/lib/logger';
import { mapTaskRowToTask } from './core';

export async function provisionTask(taskId: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!row) throw new Error(`Task not found: ${taskId}`);

  const task = mapTaskRowToTask(row);
  const project = projectManager.getProject(task.projectId);
  if (!project) throw new Error(`Project not found: ${task.projectId}`);

  const existingTask = project.getTask(taskId);

  if (existingTask) {
    const wsId = workspaceKey(existingTask.taskBranch);
    return { path: project.getWorkspace(wsId)?.path ?? '', workspaceId: wsId };
  }

  // Workspace-provider tasks: connect via SSH to the provisioned instance
  if (task.usesWorkspaceProvider) {
    if (!(project instanceof LocalProjectProvider)) {
      throw new Error('Workspace provider tasks are only supported for local projects');
    }
    return provisionWorkspaceProviderTask(taskId, task, project);
  }

  const [existingTerminals, existingConversations] = await Promise.all([
    db
      .select()
      .from(terminals)
      .where(eq(terminals.taskId, taskId))
      .then((rows) => rows.map(mapTerminalRowToTerminal)),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.taskId, taskId))
      .then((rows) => rows.map((r) => mapConversationRowToConversation(r, true))),
  ]);

  const result = await project.provisionTask(task, existingConversations, existingTerminals);
  if (!result.success) throw new Error(`Failed to provision task: ${result.error.message}`);

  await db
    .update(tasks)
    .set({ lastInteractedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(tasks.id, taskId));

  const wsId = workspaceKey(task.taskBranch);
  return { path: project.getWorkspace(wsId)?.path ?? '', workspaceId: wsId };
}

async function provisionWorkspaceProviderTask(
  taskId: string,
  task: ReturnType<typeof mapTaskRowToTask>,
  project: LocalProjectProvider
) {
  const instance = await getInstance(taskId);
  if (!instance || instance.status !== 'ready') {
    throw new Error('Workspace instance is not ready');
  }
  if (!instance.host) {
    throw new Error('Workspace instance has no host');
  }

  // Create an SSH connection entry for this workspace instance
  const connectionId = `workspace-${taskId}`;
  const connectionName = `workspace-${task.name}`;

  // Insert SSH connection row (use agent auth by default)
  await db
    .insert(sshConnections)
    .values({
      id: connectionId,
      name: connectionName,
      host: instance.host,
      port: instance.port,
      username: instance.username ?? 'root',
      authType: 'agent',
    })
    .onConflictDoUpdate({
      target: sshConnections.id,
      set: {
        host: instance.host,
        port: instance.port,
        username: instance.username ?? 'root',
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });

  // Connect via SSH
  const proxy = await sshConnectionManager.connect(connectionId);
  const exec = getSshExec(proxy);

  const workDir = instance.worktreePath ?? '/workspace';
  const taskEnvVars = getTaskEnvVars({
    taskId: task.id,
    taskName: task.name,
    taskPath: workDir,
    projectPath: workDir,
    defaultBranch: task.sourceBranch,
    portSeed: workDir,
  });

  const projectSettings = await project.settings.get();
  const tmuxEnabled = projectSettings.tmux ?? false;
  const shellSetup = projectSettings.shellSetup;

  const conversationProvider = new SshConversationProvider({
    projectId: task.projectId,
    taskPath: workDir,
    taskId: task.id,
    tmux: tmuxEnabled,
    shellSetup,
    exec,
    proxy,
    taskEnvVars,
  });

  const terminalProvider = new SshTerminalProvider({
    projectId: task.projectId,
    scopeId: task.id,
    taskPath: workDir,
    tmux: tmuxEnabled,
    shellSetup,
    exec,
    proxy,
    taskEnvVars,
  });

  const taskProvider: TaskProvider = {
    taskId: task.id,
    taskBranch: task.taskBranch,
    sourceBranch: task.sourceBranch,
    taskEnvVars,
    conversations: conversationProvider,
    terminals: terminalProvider,
  };

  // Register with the project provider so later RPCs can find it
  project.registerExternalTask(taskId, taskProvider);

  // Hydrate existing terminals/conversations if any
  const [existingTerminals, existingConversations] = await Promise.all([
    db
      .select()
      .from(terminals)
      .where(eq(terminals.taskId, taskId))
      .then((rows) => rows.map(mapTerminalRowToTerminal)),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.taskId, taskId))
      .then((rows) => rows.map((r) => mapConversationRowToConversation(r, true))),
  ]);

  void Promise.all(
    existingTerminals.map((term) =>
      terminalProvider.spawnTerminal(term).catch((e) => {
        log.error('provisionWorkspaceProviderTask: failed to hydrate terminal', {
          terminalId: term.id,
          error: String(e),
        });
      })
    )
  );

  void Promise.all(
    existingConversations.map((conv) =>
      conversationProvider.startSession(conv, undefined, true).catch((e) => {
        log.error('provisionWorkspaceProviderTask: failed to hydrate conversation', {
          conversationId: conv.id,
          error: String(e),
        });
      })
    )
  );

  await db
    .update(tasks)
    .set({ lastInteractedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(tasks.id, taskId));

  log.info('provisionWorkspaceProviderTask: provisioned SSH-backed task', {
    taskId,
    host: instance.host,
    port: instance.port,
    workDir,
  });

  return { path: workDir, workspaceId: workspaceKey(task.taskBranch) };
}
