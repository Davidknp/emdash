import type { AutomationSchedule, DayOfWeek, ScheduleType } from '@shared/automations/types';

// ---------------------------------------------------------------------------
// Timezone semantics
// ---------------------------------------------------------------------------
//
// All schedule fields (`hour`, `minute`, `dayOfWeek`, `dayOfMonth`, and BYHOUR/
// BYMINUTE/BYDAY/BYMONTHDAY for custom RRULEs) are interpreted in the Main
// process's LOCAL timezone. A `daily 09:00` schedule fires at 09:00 wall-clock
// time on the machine running emdash, regardless of the user's travel or DST.
//
// DST transitions are handled by the underlying JS Date API: `setHours(9,0,0,0)`
// on a target day always produces 09:00 wall-clock. During the fall-back hour
// (repeated 01:xx–02:00 local) a 01:30 schedule fires on the first occurrence.
// During the spring-forward hour (skipped 02:xx–03:00 local) a schedule in that
// window fires at the next representable instant because `setHours` normalizes.
// ---------------------------------------------------------------------------

export const DAY_ORDER: DayOfWeek[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const VALID_SCHEDULE_TYPES: ScheduleType[] = [
  'hourly',
  'daily',
  'weekly',
  'monthly',
  'custom',
];

const RRULE_PREFIX = 'RRULE:';
const RRULE_DAY_MAP = {
  SU: 'sun',
  MO: 'mon',
  TU: 'tue',
  WE: 'wed',
  TH: 'thu',
  FR: 'fri',
  SA: 'sat',
} as const;

type RRuleFrequency = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

type ParsedCustomRRule = {
  freq: RRuleFrequency;
  byHour: number[];
  byMinute: number[];
  byDay: DayOfWeek[];
  byMonthDay: number[];
  interval: number;
  count: number | null;
};

function parsePositiveInteger(raw: string, label: string): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label} value: ${raw} (must be a positive integer)`);
  }
  return value;
}

function startOfHour(date: Date): Date {
  const next = new Date(date);
  next.setMinutes(0, 0, 0);
  return next;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function monthIndex(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

function parseNumberList(raw: string, label: string, min: number, max: number): number[] {
  const values = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const value = Number(part);
      if (!Number.isInteger(value) || value < min || value > max) {
        throw new Error(`Invalid ${label} value: ${part} (must be ${min}-${max})`);
      }
      return value;
    });

  if (values.length === 0) {
    throw new Error(`RRULE ${label} must include at least one value`);
  }

  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function parseDayList(raw: string): DayOfWeek[] {
  const values = raw
    .split(',')
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .map((part) => {
      const day = RRULE_DAY_MAP[part as keyof typeof RRULE_DAY_MAP];
      if (!day) {
        throw new Error(`Invalid BYDAY value: ${part}`);
      }
      return day;
    });

  if (values.length === 0) {
    throw new Error('RRULE BYDAY must include at least one value');
  }

  return Array.from(new Set(values)).sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
}

function parseCustomRRule(rrule: string): ParsedCustomRRule {
  const normalized = rrule.trim();
  if (!normalized) {
    throw new Error('Custom RRULE cannot be empty');
  }

  const body = normalized.startsWith(RRULE_PREFIX)
    ? normalized.slice(RRULE_PREFIX.length)
    : normalized;
  if (!body.trim()) {
    throw new Error('Custom RRULE cannot be empty');
  }

  const entries = body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const fields = new Map<string, string>();

  for (const entry of entries) {
    const [keyRaw, valueRaw] = entry.split('=', 2);
    const key = keyRaw?.trim().toUpperCase();
    const value = valueRaw?.trim();
    if (!key || !value) {
      throw new Error(`Invalid RRULE segment: ${entry}`);
    }
    if (fields.has(key)) {
      throw new Error(`Duplicate RRULE field: ${key}`);
    }
    fields.set(key, value);
  }

  const unsupported = [...fields.keys()].filter(
    (key) =>
      !['FREQ', 'BYHOUR', 'BYMINUTE', 'BYDAY', 'BYMONTHDAY', 'INTERVAL', 'COUNT'].includes(key)
  );
  if (unsupported.length > 0) {
    throw new Error(`Unsupported RRULE field(s): ${unsupported.join(', ')}`);
  }

  const freq = fields.get('FREQ');
  if (!freq || !['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) {
    throw new Error(`Invalid RRULE FREQ: ${freq ?? 'missing'}`);
  }
  const parsedFreq = freq as RRuleFrequency;

  const byMinute = fields.has('BYMINUTE')
    ? parseNumberList(fields.get('BYMINUTE') ?? '', 'BYMINUTE', 0, 59)
    : [];
  const byHour = fields.has('BYHOUR')
    ? parseNumberList(fields.get('BYHOUR') ?? '', 'BYHOUR', 0, 23)
    : [];
  const byDay = fields.has('BYDAY') ? parseDayList(fields.get('BYDAY') ?? '') : [];
  const byMonthDay = fields.has('BYMONTHDAY')
    ? parseNumberList(fields.get('BYMONTHDAY') ?? '', 'BYMONTHDAY', 1, 31)
    : [];
  const interval = fields.has('INTERVAL')
    ? parsePositiveInteger(fields.get('INTERVAL') ?? '', 'INTERVAL')
    : 1;
  const count = fields.has('COUNT')
    ? parsePositiveInteger(fields.get('COUNT') ?? '', 'COUNT')
    : null;

  switch (parsedFreq) {
    case 'HOURLY':
      if (byMinute.length === 0) {
        throw new Error('Hourly RRULE requires BYMINUTE');
      }
      if (byHour.length > 0 || byDay.length > 0 || byMonthDay.length > 0) {
        throw new Error('Hourly RRULE only supports FREQ and BYMINUTE');
      }
      break;
    case 'DAILY':
      if (byHour.length === 0 || byMinute.length === 0) {
        throw new Error('Daily RRULE requires BYHOUR and BYMINUTE');
      }
      if (byMonthDay.length > 0) {
        throw new Error('Daily RRULE does not support BYMONTHDAY');
      }
      break;
    case 'WEEKLY':
      if (byHour.length === 0 || byMinute.length === 0 || byDay.length === 0) {
        throw new Error('Weekly RRULE requires BYDAY, BYHOUR and BYMINUTE');
      }
      if (byMonthDay.length > 0) {
        throw new Error('Weekly RRULE does not support BYMONTHDAY');
      }
      break;
    case 'MONTHLY':
      if (byHour.length === 0 || byMinute.length === 0 || byMonthDay.length === 0) {
        throw new Error('Monthly RRULE requires BYMONTHDAY, BYHOUR and BYMINUTE');
      }
      if (byDay.length > 0) {
        throw new Error('Monthly RRULE does not support BYDAY');
      }
      break;
  }

  return {
    freq: parsedFreq,
    byHour,
    byMinute,
    byDay,
    byMonthDay,
    interval,
    count,
  };
}

function matchesInterval(date: Date, rule: ParsedCustomRRule, anchorDate: Date): boolean {
  switch (rule.freq) {
    case 'HOURLY': {
      const diff =
        (startOfHour(date).getTime() - startOfHour(anchorDate).getTime()) / (60 * 60 * 1000);
      return diff >= 0 && Number.isInteger(diff) && diff % rule.interval === 0;
    }
    case 'DAILY': {
      const diff =
        (startOfDay(date).getTime() - startOfDay(anchorDate).getTime()) / (24 * 60 * 60 * 1000);
      return diff >= 0 && Number.isInteger(diff) && diff % rule.interval === 0;
    }
    case 'WEEKLY': {
      const diff =
        (startOfWeek(date).getTime() - startOfWeek(anchorDate).getTime()) /
        (7 * 24 * 60 * 60 * 1000);
      return diff >= 0 && Number.isInteger(diff) && diff % rule.interval === 0;
    }
    case 'MONTHLY': {
      const diff = monthIndex(date) - monthIndex(anchorDate);
      return diff >= 0 && diff % rule.interval === 0;
    }
  }
}

function computeNextRunFromCustomRRule(rrule: string, fromDate?: Date, anchorDate?: Date): string {
  const rule = parseCustomRRule(rrule);
  const now = fromDate ?? new Date();
  const anchor = anchorDate ?? now;

  // For HOURLY, iterate minute-by-minute within each bucketed hour that matches
  // the interval. Otherwise, walk days and only try each byHour×byMinute slot.
  const horizonMs = 2 * 366 * 24 * 60 * 60 * 1000;
  const deadline = new Date(now.getTime() + horizonMs);
  let occurrenceCount = 0;

  const trackOccurrence = (candidate: Date): string | null => {
    occurrenceCount += 1;
    if (rule.count !== null && occurrenceCount > rule.count) {
      throw new Error('Custom RRULE has exhausted its COUNT limit');
    }
    if (candidate > now) return candidate.toISOString();
    return null;
  };

  if (rule.freq === 'HOURLY') {
    const candidate = new Date(anchor < now ? anchor : now);
    candidate.setSeconds(0, 0);
    // Cap iterations: minutes in 2 years ≈ 1.05M. We tighten by skipping whole
    // hours that don't match the interval.
    while (candidate <= deadline) {
      if (matchesInterval(candidate, rule, anchor)) {
        const minute = candidate.getMinutes();
        if (rule.byMinute.includes(minute)) {
          const result = trackOccurrence(candidate);
          if (result) return result;
        }
        candidate.setMinutes(candidate.getMinutes() + 1);
      } else {
        // Skip to the start of the next hour.
        candidate.setMinutes(0, 0, 0);
        candidate.setHours(candidate.getHours() + 1);
      }
    }
    throw new Error('Could not compute next run for custom RRULE within 2 years');
  }

  // DAILY / WEEKLY / MONTHLY — walk candidate days and check each byHour×byMinute slot.
  const hours = rule.byHour.length > 0 ? rule.byHour : [0];
  const minutes = rule.byMinute.length > 0 ? rule.byMinute : [0];
  const daysByMs = 24 * 60 * 60 * 1000;
  const dayStart = startOfDay(anchor < now ? anchor : now);
  const dayCursor = new Date(dayStart);
  const maxDays = Math.ceil(horizonMs / daysByMs);

  for (let d = 0; d < maxDays; d += 1) {
    const dayMatches = (() => {
      switch (rule.freq) {
        case 'DAILY':
          return matchesInterval(dayCursor, rule, anchor);
        case 'WEEKLY':
          return (
            matchesInterval(dayCursor, rule, anchor) &&
            rule.byDay.includes(DAY_ORDER[dayCursor.getDay()])
          );
        case 'MONTHLY':
          return (
            matchesInterval(dayCursor, rule, anchor) &&
            rule.byMonthDay.includes(dayCursor.getDate())
          );
        default:
          return false;
      }
    })();

    if (dayMatches) {
      for (const hour of hours) {
        for (const minute of minutes) {
          const candidate = new Date(dayCursor);
          candidate.setHours(hour, minute, 0, 0);
          if (candidate < anchor) continue;
          const result = trackOccurrence(candidate);
          if (result) return result;
        }
      }
    }

    dayCursor.setDate(dayCursor.getDate() + 1);
    if (dayCursor > deadline) break;
  }

  throw new Error('Could not compute next run for custom RRULE within 2 years');
}

function assertMinute(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 59) {
    throw new Error(`Invalid minute: ${value} (must be 0-59)`);
  }
}

function assertHour(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 23) {
    throw new Error(`Invalid hour: ${value} (must be 0-23)`);
  }
}

function assertDayOfMonth(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 31) {
    throw new Error(`Invalid dayOfMonth: ${value} (must be 1-31)`);
  }
}

export function validateSchedule(schedule: AutomationSchedule): void {
  switch (schedule.type) {
    case 'hourly':
      assertMinute(schedule.minute);
      return;
    case 'daily':
      assertMinute(schedule.minute);
      assertHour(schedule.hour);
      return;
    case 'weekly':
      assertMinute(schedule.minute);
      assertHour(schedule.hour);
      if (!DAY_ORDER.includes(schedule.dayOfWeek)) {
        throw new Error(`Invalid dayOfWeek: ${schedule.dayOfWeek}`);
      }
      return;
    case 'monthly':
      assertMinute(schedule.minute);
      assertHour(schedule.hour);
      assertDayOfMonth(schedule.dayOfMonth);
      return;
    case 'custom':
      parseCustomRRule(schedule.rrule);
      return;
  }
}

export function computeNextRun(
  schedule: AutomationSchedule,
  fromDate?: Date,
  anchorDate?: Date
): string {
  const now = fromDate ?? new Date();
  const next = new Date(now);

  switch (schedule.type) {
    case 'hourly': {
      next.setMinutes(schedule.minute, 0, 0);
      if (next <= now) next.setHours(next.getHours() + 1);
      break;
    }
    case 'daily': {
      next.setHours(schedule.hour, schedule.minute, 0, 0);
      if (next <= now) next.setDate(next.getDate() + 1);
      break;
    }
    case 'weekly': {
      const targetDay = DAY_ORDER.indexOf(schedule.dayOfWeek);
      const currentDay = next.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0) daysUntil += 7;
      if (daysUntil === 0) {
        next.setHours(schedule.hour, schedule.minute, 0, 0);
        if (next <= now) daysUntil = 7;
      }
      if (daysUntil > 0) next.setDate(next.getDate() + daysUntil);
      next.setHours(schedule.hour, schedule.minute, 0, 0);
      break;
    }
    case 'monthly': {
      const daysInCurrent = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(schedule.dayOfMonth, daysInCurrent));
      next.setHours(schedule.hour, schedule.minute, 0, 0);
      if (next <= now) {
        next.setDate(1);
        next.setMonth(next.getMonth() + 1);
        const daysInNext = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
        next.setDate(Math.min(schedule.dayOfMonth, daysInNext));
        next.setHours(schedule.hour, schedule.minute, 0, 0);
      }
      break;
    }
    case 'custom':
      return computeNextRunFromCustomRRule(schedule.rrule, now, anchorDate);
  }

  return next.toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dayOfWeekOr(value: unknown, fallback: DayOfWeek): DayOfWeek {
  return typeof value === 'string' && (DAY_ORDER as string[]).includes(value)
    ? (value as DayOfWeek)
    : fallback;
}

export function normalizeSchedule(raw: unknown): AutomationSchedule {
  if (!isRecord(raw)) {
    throw new Error('Invalid schedule: expected an object');
  }
  const minute = numberOr(raw.minute, 0);
  const hour = numberOr(raw.hour, 0);
  switch (raw.type) {
    case 'hourly':
      return { type: 'hourly', minute };
    case 'daily':
      return { type: 'daily', hour, minute };
    case 'weekly':
      return {
        type: 'weekly',
        dayOfWeek: dayOfWeekOr(raw.dayOfWeek, 'mon'),
        hour,
        minute,
      };
    case 'monthly':
      return {
        type: 'monthly',
        dayOfMonth: numberOr(raw.dayOfMonth, 1),
        hour,
        minute,
      };
    case 'custom':
      return {
        type: 'custom',
        rrule: typeof raw.rrule === 'string' ? raw.rrule : '',
      };
    default:
      throw new Error(`Invalid schedule type: ${String(raw.type)}`);
  }
}

export function serializeSchedule(schedule: AutomationSchedule): string {
  return JSON.stringify(schedule);
}

export function deserializeSchedule(serialized: string): AutomationSchedule {
  const raw: unknown = JSON.parse(serialized);
  const schedule = normalizeSchedule(raw);
  validateSchedule(schedule);
  return schedule;
}
