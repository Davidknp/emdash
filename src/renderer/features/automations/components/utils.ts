import type { AutomationSchedule, DayOfWeek, TriggerType } from '@shared/automations/types';

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export function describeSchedule(schedule: AutomationSchedule): string {
  const hour = schedule.hour ?? 0;
  const minute = schedule.minute ?? 0;
  const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  switch (schedule.type) {
    case 'hourly':
      return `Every hour at :${String(minute).padStart(2, '0')}`;
    case 'daily':
      return `Every day at ${time}`;
    case 'weekly': {
      const day = schedule.dayOfWeek ? DAY_LABELS[schedule.dayOfWeek] : 'Monday';
      return `Every ${day} at ${time}`;
    }
    case 'monthly':
      return `Day ${schedule.dayOfMonth ?? 1} of each month at ${time}`;
  }
}

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  github_pr: 'GitHub PR',
  github_issue: 'GitHub Issue',
  linear_issue: 'Linear Issue',
  jira_issue: 'Jira Issue',
  gitlab_issue: 'GitLab Issue',
  gitlab_mr: 'GitLab MR',
  forgejo_issue: 'Forgejo Issue',
  plain_thread: 'Plain Thread',
};

export function describeTrigger(triggerType: TriggerType | null): string {
  if (!triggerType) return 'No trigger';
  return TRIGGER_TYPE_LABELS[triggerType];
}

function formatDurationFromMs(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (Math.abs(seconds) < 60) return `${Math.abs(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return `${Math.abs(minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${Math.abs(hours)}h`;
  const days = Math.round(hours / 24);
  return `${Math.abs(days)}d`;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  return `${formatDurationFromMs(Date.now() - then)} ago`;
}

export function formatRelativeFuture(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diff = then - Date.now();
  if (diff <= 0) return 'now';
  return `in ${formatDurationFromMs(diff)}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
