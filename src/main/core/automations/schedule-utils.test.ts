import { describe, expect, it } from 'vitest';
import { computeNextRun, validateSchedule } from './schedule-utils';

describe('custom automation schedules', () => {
  it('accepts the documented weekly RRULE example', () => {
    expect(() =>
      validateSchedule({
        type: 'custom',
        rrule: 'RRULE:FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0;BYDAY=SU,MO,TU,WE,TH,FR,SA',
      })
    ).not.toThrow();
  });

  it('computes the next run for a weekly RRULE with multiple days', () => {
    const from = new Date(2026, 3, 23, 8, 30); // April 23, 2026, 08:30 local time
    const nextRun = computeNextRun(
      {
        type: 'custom',
        rrule: 'RRULE:FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0;BYDAY=MO,WE,FR',
      },
      from
    );

    const expected = new Date(2026, 3, 24, 9, 0).toISOString(); // April 24, 2026, 09:00 local time
    expect(nextRun).toBe(expected);
  });

  it('rejects incomplete custom RRULEs', () => {
    expect(() =>
      validateSchedule({
        type: 'custom',
        rrule: 'RRULE:FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0',
      })
    ).toThrow('Weekly RRULE requires BYDAY, BYHOUR and BYMINUTE');
  });

  it('supports INTERVAL for weekly schedules', () => {
    const from = new Date(2026, 4, 1, 8, 30); // May 1, 2026, 08:30 local time
    const anchor = new Date(2026, 3, 24, 8, 0); // April 24, 2026, 08:00 local time
    const nextRun = computeNextRun(
      {
        type: 'custom',
        rrule: 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYHOUR=9;BYMINUTE=0;BYDAY=FR',
      },
      from,
      anchor
    );

    const expected = new Date(2026, 4, 8, 9, 0).toISOString(); // May 8, 2026, 09:00 local time
    expect(nextRun).toBe(expected);
  });

  it('stops scheduling after COUNT occurrences have been exhausted', () => {
    expect(() =>
      computeNextRun(
        {
          type: 'custom',
          rrule: 'RRULE:FREQ=DAILY;COUNT=2;BYHOUR=9;BYMINUTE=0',
        },
        new Date('2026-04-25T08:30:00.000Z'),
        new Date('2026-04-23T08:00:00.000Z')
      )
    ).toThrow('Custom RRULE has exhausted its COUNT limit');
  });
});

describe('monthly schedule next run', () => {
  it('schedules on the requested day of the current month when it is in the future', () => {
    const from = new Date(2026, 0, 15, 10, 0); // Jan 15, 10:00
    const nextRun = computeNextRun({ type: 'monthly', dayOfMonth: 20, hour: 9, minute: 0 }, from);
    expect(nextRun).toBe(new Date(2026, 0, 20, 9, 0).toISOString());
  });

  it('rolls to the next month when the requested day has already passed', () => {
    const from = new Date(2026, 0, 25, 10, 0); // Jan 25, 10:00
    const nextRun = computeNextRun({ type: 'monthly', dayOfMonth: 20, hour: 9, minute: 0 }, from);
    expect(nextRun).toBe(new Date(2026, 1, 20, 9, 0).toISOString());
  });

  it('clamps to the last day when the current month has fewer days than requested', () => {
    const from = new Date(2026, 1, 15, 10, 0); // Feb 15, 10:00
    const nextRun = computeNextRun({ type: 'monthly', dayOfMonth: 31, hour: 9, minute: 0 }, from);
    expect(nextRun).toBe(new Date(2026, 1, 28, 9, 0).toISOString()); // Feb has 28 days in 2026
  });

  it('advances to the next month without overflowing when day exceeds next month length', () => {
    // Jan 31 -> should go to Feb 28, not March
    const from = new Date(2026, 0, 31, 10, 0); // Jan 31, 10:00
    const nextRun = computeNextRun({ type: 'monthly', dayOfMonth: 31, hour: 9, minute: 0 }, from);
    expect(nextRun).toBe(new Date(2026, 1, 28, 9, 0).toISOString()); // Feb 28
  });

  it('correctly advances from a short month to a longer month', () => {
    // Feb 28 -> should go to Mar 31
    const from = new Date(2026, 1, 28, 10, 0); // Feb 28, 10:00
    const nextRun = computeNextRun({ type: 'monthly', dayOfMonth: 31, hour: 9, minute: 0 }, from);
    expect(nextRun).toBe(new Date(2026, 2, 31, 9, 0).toISOString()); // Mar 31
  });
});

describe('hourly schedule next run', () => {
  it('schedules for the upcoming minute in the current hour if it is still in the future', () => {
    const from = new Date(2026, 4, 10, 14, 20); // May 10, 14:20
    const nextRun = computeNextRun({ type: 'hourly', minute: 45 }, from);
    expect(nextRun).toBe(new Date(2026, 4, 10, 14, 45).toISOString());
  });

  it('rolls over to the next hour when the minute has already passed', () => {
    const from = new Date(2026, 4, 10, 14, 50);
    const nextRun = computeNextRun({ type: 'hourly', minute: 10 }, from);
    expect(nextRun).toBe(new Date(2026, 4, 10, 15, 10).toISOString());
  });

  it('treats "same minute as now" as already passed and schedules for next hour', () => {
    const from = new Date(2026, 4, 10, 14, 30, 45); // 14:30:45
    const nextRun = computeNextRun({ type: 'hourly', minute: 30 }, from);
    expect(nextRun).toBe(new Date(2026, 4, 10, 15, 30).toISOString());
  });
});

describe('custom RRULE edge cases', () => {
  it('rejects empty or whitespace-only RRULEs', () => {
    expect(() => validateSchedule({ type: 'custom', rrule: '' })).toThrow(/empty/);
    expect(() => validateSchedule({ type: 'custom', rrule: '   ' })).toThrow(/empty/);
    expect(() => validateSchedule({ type: 'custom', rrule: 'RRULE:' })).toThrow(/empty/);
  });

  it('rejects unsupported RRULE fields', () => {
    expect(() =>
      validateSchedule({
        type: 'custom',
        rrule: 'RRULE:FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSETPOS=1',
      })
    ).toThrow(/Unsupported RRULE field/);
  });

  it('rejects duplicate RRULE fields', () => {
    expect(() =>
      validateSchedule({
        type: 'custom',
        rrule: 'RRULE:FREQ=DAILY;BYHOUR=9;BYHOUR=10;BYMINUTE=0',
      })
    ).toThrow(/Duplicate RRULE/);
  });

  it('handles a monthly RRULE with BYMONTHDAY=31 and large INTERVAL without blocking', () => {
    const from = new Date(2026, 1, 5, 12, 0); // Feb 5, 2026 (past Jan 31 match)
    const anchor = new Date(2026, 0, 1, 0, 0); // anchor Jan 1, 2026
    const start = Date.now();
    const nextRun = computeNextRun(
      {
        type: 'custom',
        rrule: 'RRULE:FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=31;BYHOUR=9;BYMINUTE=0',
      },
      from,
      anchor
    );
    const elapsedMs = Date.now() - start;
    // INTERVAL=12 → only anchor month (Jan) + every 12 months. Next Jan 31 after
    // Feb 5 2026 is Jan 31, 2027 at 09:00 local.
    expect(nextRun).toBe(new Date(2027, 0, 31, 9, 0).toISOString());
    // Pathological iteration guard — should finish well under a second.
    expect(elapsedMs).toBeLessThan(500);
  });

  it('requires BYMINUTE for HOURLY and rejects any day/month specifier', () => {
    expect(() => validateSchedule({ type: 'custom', rrule: 'RRULE:FREQ=HOURLY' })).toThrow(
      /BYMINUTE/
    );
    expect(() =>
      validateSchedule({
        type: 'custom',
        rrule: 'RRULE:FREQ=HOURLY;BYMINUTE=0;BYDAY=MO',
      })
    ).toThrow(/only supports FREQ and BYMINUTE/);
  });

  it('supports HOURLY with multiple BYMINUTE values', () => {
    const from = new Date(2026, 3, 10, 14, 20);
    const nextRun = computeNextRun(
      { type: 'custom', rrule: 'RRULE:FREQ=HOURLY;BYMINUTE=15,45' },
      from
    );
    expect(nextRun).toBe(new Date(2026, 3, 10, 14, 45).toISOString());
  });
});
