import { defineEvent } from '@shared/ipc/events';

export type AutomationRunStatus = 'started' | 'ended';

export interface AutomationRunStatusPayload {
  automationId: string;
  runLogId: string;
  taskId: string | null;
  status: AutomationRunStatus;
}

export const automationRunStatusChannel =
  defineEvent<AutomationRunStatusPayload>('automations:run-status');
