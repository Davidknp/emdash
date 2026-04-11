import { defineEvent } from '@shared/ipc/events';

export type WorkspaceProvisionProgress = {
  instanceId: string;
  line: string;
};

export type WorkspaceProvisionTimeoutWarning = {
  instanceId: string;
  timeoutMs: number;
};

export type WorkspaceProvisionComplete = {
  instanceId: string;
  status: string;
  error?: string;
};

export const workspaceProvisionProgressChannel = defineEvent<WorkspaceProvisionProgress>(
  'workspace:provision-progress'
);

export const workspaceProvisionTimeoutWarningChannel =
  defineEvent<WorkspaceProvisionTimeoutWarning>('workspace:provision-timeout-warning');

export const workspaceProvisionCompleteChannel = defineEvent<WorkspaceProvisionComplete>(
  'workspace:provision-complete'
);
