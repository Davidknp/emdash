import { eq, sql } from 'drizzle-orm';
import { mapConversationRowToConversation } from '@main/core/conversations/utils';
import { projectManager } from '@main/core/projects/project-manager';
import { mapTerminalRowToTerminal } from '@main/core/terminals/core';
import { getActiveInstance } from '@main/core/workspace-provider/workspace-provider-service';
import { db } from '@main/db/client';
import { conversations, tasks, terminals } from '@main/db/schema';
import { mapTaskRowToTask } from './core';

export async function provisionTask(taskId: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!row) throw new Error(`Task not found: ${taskId}`);

  const task = mapTaskRowToTask(row);
  const project = projectManager.getProject(task.projectId);
  if (!project) throw new Error(`Project not found: ${task.projectId}`);

  // For workspace-provider tasks, guard against premature provisioning while
  // the workspace script is still running. The provider itself knows how to
  // route via `task.workspaceInstanceId` once the instance is ready.
  if (task.workspaceInstanceId) {
    const instance = await getActiveInstance(taskId);
    if (instance?.status === 'provisioning') {
      throw new Error('Workspace is still being provisioned');
    }
    if (instance?.status === 'error') {
      throw new Error('Workspace provisioning failed');
    }
    if (!instance || instance.status !== 'ready' || !instance.connectionId) {
      throw new Error('Workspace instance is not ready');
    }
  }

  const existingTask = project.getTask(taskId);
  if (existingTask) {
    return { path: existingTask.taskPath };
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

  return {
    path: result.data.taskPath,
  };
}
