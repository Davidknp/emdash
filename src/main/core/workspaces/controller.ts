import { eq } from 'drizzle-orm';
import { createRPCController } from '@shared/ipc/rpc';
import { getProjectById } from '@main/core/projects/operations/getProjects';
import { projectManager } from '@main/core/projects/project-manager';
import { db } from '@main/db/client';
import { tasks } from '@main/db/schema';
import { log } from '@main/lib/logger';
import { mapTaskRowToTask } from '../tasks/core';
import { cancel, getInstance, provision, terminate } from './script-workspace-runner';

export const workspaceProviderController = createRPCController({
  getInstance: (taskId: string) => {
    return getInstance(taskId);
  },
  cancelProvision: (taskId: string) => {
    return cancel(taskId);
  },
  retryProvision: async (taskId: string) => {
    // Cancel any existing provision first
    await cancel(taskId);

    // Look up the task and project to rebuild provision args
    const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!row) throw new Error(`Task not found: ${taskId}`);
    const task = mapTaskRowToTask(row);

    const project = projectManager.getProject(task.projectId);
    if (!project) throw new Error(`Project not found: ${task.projectId}`);
    const projectSettings = await project.settings.get();
    if (!projectSettings.workspaceProvider) {
      throw new Error('No workspaceProvider configured in project settings');
    }

    const projectData = await getProjectById(task.projectId);
    const remotes = await project.git.getRemotes();
    const remote = projectSettings.remote?.trim() || 'origin';
    const remoteUrl = remotes.find((r) => r.name === remote)?.url ?? null;

    log.info('workspaceProviderController: retrying provision', { taskId });

    return provision({
      taskId,
      projectPath: projectData?.path ?? '',
      projectSettings,
      remoteUrl,
      branch: task.taskBranch ?? task.sourceBranch,
      baseRef: projectSettings.defaultBranch ?? 'main',
    });
  },
  isFeatureEnabled: () => {
    // Check env var override for dev/QA
    const envOverride = process.env.EMDASH_FEATURE_WORKSPACE_PROVIDER;
    return envOverride === '1' || envOverride === 'true';
  },
  provision: (args: {
    taskId: string;
    projectPath: string;
    projectSettings: Parameters<typeof provision>[0]['projectSettings'];
    remoteUrl: string | null;
    branch: string | null;
    baseRef: string;
  }) => {
    return provision(args);
  },
  terminate: (args: {
    taskId: string;
    projectPath: string;
    projectSettings: Parameters<typeof terminate>[0]['projectSettings'];
  }) => {
    return terminate(args);
  },
});
