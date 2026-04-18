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

export function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const seconds = Math.round(diff / 1000);
  if (Math.abs(seconds) < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
