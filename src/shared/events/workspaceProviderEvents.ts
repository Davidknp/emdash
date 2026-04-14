import { defineEvent } from '@shared/ipc/events';
import type { WorkspaceInstanceStatus } from '@shared/tasks';

export const workspaceProvisionProgressChannel = defineEvent<{
  taskId: string;
  line: string;
}>('workspace-provider:provision-progress');

export const workspaceProvisionStatusChannel = defineEvent<{
  taskId: string;
  status: WorkspaceInstanceStatus;
  errorMessage?: string;
}>('workspace-provider:provision-status');

export const workspaceProvisionTimeoutWarningChannel = defineEvent<{
  taskId: string;
  elapsedMs: number;
}>('workspace-provider:provision-timeout-warning');
