export type ScheduleType = 'hourly' | 'daily' | 'weekly' | 'monthly';

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface AutomationSchedule {
  type: ScheduleType;
  hour?: number;
  minute?: number;
  dayOfWeek?: DayOfWeek;
  dayOfMonth?: number;
}

export type TriggerType =
  | 'github_pr'
  | 'github_issue'
  | 'linear_issue'
  | 'jira_issue'
  | 'gitlab_issue'
  | 'gitlab_mr'
  | 'forgejo_issue'
  | 'plain_thread';

export type TriggerIntegrationId = 'github' | 'linear' | 'jira' | 'gitlab' | 'forgejo' | 'plain';

export interface TriggerConfig {
  branchFilter?: string;
  labelFilter?: string[];
  assigneeFilter?: string;
}

export type AutomationMode = 'schedule' | 'trigger';

export type AutomationStatus = 'active' | 'paused' | 'error';

export interface Automation {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  prompt: string;
  agentId: string;
  mode: AutomationMode;
  schedule: AutomationSchedule;
  triggerType: TriggerType | null;
  triggerConfig: TriggerConfig | null;
  useWorktree: boolean;
  status: AutomationStatus;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  lastRunResult: 'success' | 'failure' | null;
  lastRunError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRunLog {
  id: string;
  automationId: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'failure';
  error: string | null;
  taskId: string | null;
}

export interface CreateAutomationInput {
  name: string;
  projectId: string;
  projectName?: string;
  prompt: string;
  agentId: string;
  mode?: AutomationMode;
  schedule: AutomationSchedule;
  triggerType?: TriggerType;
  triggerConfig?: TriggerConfig;
  useWorktree?: boolean;
}

export interface UpdateAutomationInput {
  id: string;
  name?: string;
  projectId?: string;
  projectName?: string;
  prompt?: string;
  agentId?: string;
  mode?: AutomationMode;
  schedule?: AutomationSchedule;
  triggerType?: TriggerType | null;
  triggerConfig?: TriggerConfig | null;
  status?: AutomationStatus;
  useWorktree?: boolean;
}

export const TRIGGER_INTEGRATION_MAP: Record<TriggerType, TriggerIntegrationId> = {
  github_pr: 'github',
  github_issue: 'github',
  linear_issue: 'linear',
  jira_issue: 'jira',
  gitlab_issue: 'gitlab',
  gitlab_mr: 'gitlab',
  forgejo_issue: 'forgejo',
  plain_thread: 'plain',
};

export function getIntegrationForTrigger(triggerType: TriggerType): TriggerIntegrationId {
  return TRIGGER_INTEGRATION_MAP[triggerType];
}
