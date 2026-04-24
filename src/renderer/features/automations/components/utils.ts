import { formatDistanceToNowStrict } from 'date-fns';
import {
  TRIGGER_TYPE_LABELS,
  type AutomationSchedule,
  type TriggerType,
} from '@shared/automations/types';

export { TRIGGER_TYPE_LABELS };

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function describeTrigger(triggerType: TriggerType | null): string {
  if (!triggerType) return 'No trigger';
  return TRIGGER_TYPE_LABELS[triggerType];
}

export function describeScheduleShort(schedule: AutomationSchedule): string {
  switch (schedule.type) {
    case 'hourly':
      return 'Hourly';
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'custom':
      return 'Custom';
  }
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
