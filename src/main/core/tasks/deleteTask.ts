import { eq } from 'drizzle-orm';
import { projectManager } from '@main/core/projects/project-manager';
import { viewStateService } from '@main/core/view-state/view-state-service';
import {
  getActiveInstance,
  terminate,
} from '@main/core/workspace-provider/workspace-provider-service';
import { db } from '@main/db/client';
import { projects, tasks } from '@main/db/schema';
import { log } from '@main/lib/logger';

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return;

  const project = projectManager.getProject(projectId);

  // Teardown workspace instance if this is a workspace-provider task
  if (task.workspaceInstanceId) {
    try {
      const instance = await getActiveInstance(taskId);
      if (instance && (instance.status === 'ready' || instance.status === 'provisioning')) {
        const settings = project ? await project.settings.get() : undefined;
        const terminateCommand = settings?.workspaceProvider?.terminateCommand;

        // Get project path from DB
        const [projectRow] = await db
          .select()
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);

        if (terminateCommand && projectRow?.path) {
          await terminate({
            instanceId: instance.id,
            terminateCommand,
            projectPath: projectRow.path,
          });
        } else {
          log.warn('deleteTask: no terminate command or project path for workspace instance', {
            taskId,
            instanceId: instance.id,
          });
        }
      }
    } catch (e) {
      log.warn('deleteTask: workspace teardown failed', { taskId, error: String(e) });
      // Still proceed with deletion to avoid orphaned UI state
    }
  }

  await db.delete(tasks).where(eq(tasks.id, taskId));
  void viewStateService.del(`task:${taskId}`);

  if (project) {
    project.teardownTask(taskId).catch((e) => {
      log.warn('deleteTask: teardown failed', { taskId, error: String(e) });
    });

    if (task.taskBranch) {
      await project.removeTaskWorktree(task.taskBranch).catch((e) => {
        log.warn('deleteTask: worktree removal failed', { taskId, error: String(e) });
      });
      if (task.taskBranch !== task.sourceBranch) {
        project.git
          .deleteBranch(task.taskBranch)
          .then((result) => {
            if (!result.success) {
              log.warn('deleteTask: branch deletion failed', { taskId, error: result.error });
            }
          })
          .catch((e) => {
            log.warn('deleteTask: branch deletion failed', { taskId, error: String(e) });
          });
      }
    }
  }
}
