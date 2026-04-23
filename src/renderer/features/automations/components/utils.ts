import { formatDistanceToNowStrict } from 'date-fns';
import {
  TRIGGER_TYPE_LABELS,
  type AutomationSchedule,
  type DayOfWeek,
  type TriggerType,
} from '@shared/automations/types';

export { TRIGGER_TYPE_LABELS };

const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function describeSchedule(schedule: AutomationSchedule): string {
  switch (schedule.type) {
    case 'hourly':
      return `Every hour at :${pad2(schedule.minute)}`;
    case 'daily':
      return `Every day at ${pad2(schedule.hour)}:${pad2(schedule.minute)}`;
    case 'weekly':
      return `Every ${DAY_LABELS[schedule.dayOfWeek]} at ${pad2(schedule.hour)}:${pad2(schedule.minute)}`;
    case 'monthly':
      return `Day ${schedule.dayOfMonth} of each month at ${pad2(schedule.hour)}:${pad2(schedule.minute)}`;
    case 'custom':
      return schedule.rrule;
  }
}

export function describeTrigger(triggerType: TriggerType | null): string {
  if (!triggerType) return 'No trigger';
  return TRIGGER_TYPE_LABELS[triggerType];
}

function toCompact(date: Date): string {
  return formatDistanceToNowStrict(date, { roundingMethod: 'floor', addSuffix: false })
    .replace(/ seconds?/, 's')
    .replace(/ minutes?/, 'm')
    .replace(/ hours?/, 'h')
    .replace(/ days?/, 'd')
    .replace(/ months?/, 'mo')
    .replace(/ years?/, 'y');
}

export function formatRelative(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'never';
  return `${toCompact(date)} ago`;
}

export function formatRelativeFuture(iso: string | null): string {
  if (!iso) return 'never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'never';
  if (date.getTime() - Date.now() <= 0) return 'now';
  return `in ${toCompact(date)}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}
