import { Check, ChevronDown, Clock } from 'lucide-react';
import React from 'react';
import type { AutomationSchedule, DayOfWeek, ScheduleType } from '@shared/automations/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/lib/ui/dropdown-menu';
import { Input } from '@renderer/lib/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import { cn } from '@renderer/utils/utils';
import { pad2 } from './utils';

export const CUSTOM_RRULE_EXAMPLE =
  'RRULE:FREQ=WEEKLY;BYHOUR=9;BYMINUTE=0;BYDAY=SU,MO,TU,WE,TH,FR,SA';

export interface ScheduleFormValue {
  scheduleType: ScheduleType;
  hour: number;
  minute: number;
  dayOfWeek: DayOfWeek;
  dayOfMonth: number;
  customRRule: string;
}

export const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const DAY_SHORT: Record<DayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom: 'Advanced',
};

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
export const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5);
export const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);

export function scheduleToState(
  s: AutomationSchedule,
  defaults: Pick<ScheduleFormValue, 'hour' | 'minute' | 'dayOfWeek' | 'dayOfMonth'>
): ScheduleFormValue {
  return {
    scheduleType: s.type,
    minute: s.type === 'custom' ? defaults.minute : s.minute,
    hour: s.type === 'hourly' || s.type === 'custom' ? defaults.hour : s.hour,
    dayOfWeek: s.type === 'weekly' ? s.dayOfWeek : defaults.dayOfWeek,
    dayOfMonth: s.type === 'monthly' ? s.dayOfMonth : defaults.dayOfMonth,
    customRRule: s.type === 'custom' ? s.rrule : CUSTOM_RRULE_EXAMPLE,
  };
}

export function stateToSchedule(s: ScheduleFormValue): AutomationSchedule {
  switch (s.scheduleType) {
    case 'hourly':
      return { type: 'hourly', minute: s.minute };
    case 'daily':
      return { type: 'daily', hour: s.hour, minute: s.minute };
    case 'weekly':
      return { type: 'weekly', dayOfWeek: s.dayOfWeek, hour: s.hour, minute: s.minute };
    case 'monthly':
      return {
        type: 'monthly',
        dayOfMonth: s.dayOfMonth,
        hour: s.hour,
        minute: s.minute,
      };
    case 'custom':
      return {
        type: 'custom',
        rrule: s.customRRule.trim(),
      };
  }
}

export type ScheduleLabelVariant = 'long' | 'short';

export function scheduleLabel(
  s: ScheduleFormValue,
  variant: ScheduleLabelVariant = 'long'
): string {
  const time = `${pad2(s.hour)}:${pad2(s.minute)}`;
  const sep = variant === 'long' ? ' at ' : ' ';
  switch (s.scheduleType) {
    case 'hourly':
      return `Hourly :${pad2(s.minute)}`;
    case 'daily':
      return `Daily${sep}${time}`;
    case 'weekly':
      return `${DAY_SHORT[s.dayOfWeek]}${sep}${time}`;
    case 'monthly':
      return `Day ${s.dayOfMonth}${sep}${time}`;
    case 'custom':
      return variant === 'long' ? 'Advanced schedule' : 'Advanced';
  }
}

export function TimeSelect({
  value,
  onChange,
  options,
  width = 'w-[58px]',
}: {
  value: number;
  onChange: (n: number) => void;
  options: number[];
  width?: string;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className={cn('h-7 text-xs tabular-nums', width)}>
        <SelectValue>{pad2(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-60">
        {options.map((n) => (
          <SelectItem key={n} value={String(n)} className="tabular-nums">
            {pad2(n)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type SchedulePopoverBodyProps = {
  value: ScheduleFormValue;
  onChange: (patch: Partial<ScheduleFormValue>) => void;
};

const SCHEDULE_TYPES: ScheduleType[] = ['hourly', 'daily', 'weekly', 'monthly', 'custom'];

export function SchedulePopoverBody({ value, onChange }: SchedulePopoverBodyProps) {
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 px-3 pb-3 pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className="group/st flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-background/30 px-2.5 text-xs outline-none hover:bg-background-quaternary/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] [transition:background-color_150ms,border-color_150ms,color_150ms,box-shadow_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)]"
              >
                <span>{SCHEDULE_TYPE_LABELS[value.scheduleType]}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70 transition-transform duration-150 ease-out group-data-[state=open]/st:rotate-180 group-data-[popup-open]/st:rotate-180" />
              </button>
            }
          />
          <DropdownMenuContent align="start">
            {SCHEDULE_TYPES.map((type) => (
              <DropdownMenuItem key={type} onClick={() => onChange({ scheduleType: type })}>
                <span className="flex-1">{SCHEDULE_TYPE_LABELS[type]}</span>
                {value.scheduleType === type && <Check className="h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {(value.scheduleType === 'daily' ||
          value.scheduleType === 'weekly' ||
          value.scheduleType === 'monthly') && (
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {value.scheduleType === 'weekly' && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="group/dw flex h-7 w-[74px] items-center justify-between gap-1.5 rounded-md border border-border bg-transparent px-2.5 text-xs outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] [transition:background-color_150ms,border-color_150ms,color_150ms,box-shadow_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)]"
                    >
                      <span>{DAY_SHORT[value.dayOfWeek]}</span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground/70 transition-transform duration-150 ease-out group-data-[state=open]/dw:rotate-180 group-data-[popup-open]/dw:rotate-180" />
                    </button>
                  }
                />
                <DropdownMenuContent align="start">
                  {DAYS.map((d) => (
                    <DropdownMenuItem key={d} onClick={() => onChange({ dayOfWeek: d })}>
                      <span className="flex-1">{DAY_SHORT[d]}</span>
                      {value.dayOfWeek === d && <Check className="h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {value.scheduleType === 'monthly' && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className="group/dm flex h-7 w-[82px] items-center justify-between gap-1.5 rounded-md border border-border bg-transparent px-2.5 text-xs tabular-nums outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.97] [transition:background-color_150ms,border-color_150ms,color_150ms,box-shadow_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)]"
                    >
                      <span>Day {value.dayOfMonth}</span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground/70 transition-transform duration-150 ease-out group-data-[state=open]/dm:rotate-180 group-data-[popup-open]/dm:rotate-180" />
                    </button>
                  }
                />
                <DropdownMenuContent align="start" className="max-h-60">
                  {DAY_OF_MONTH_OPTIONS.map((d) => (
                    <DropdownMenuItem key={d} onClick={() => onChange({ dayOfMonth: d })}>
                      <span className="flex-1 tabular-nums">{d}</span>
                      {value.dayOfMonth === d && <Check className="h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <TimeSelect
              value={value.hour}
              onChange={(n) => onChange({ hour: n })}
              options={HOUR_OPTIONS}
            />
            <span className="text-xs text-muted-foreground">:</span>
            <TimeSelect
              value={value.minute}
              onChange={(n) => onChange({ minute: n })}
              options={MINUTE_OPTIONS}
            />
          </div>
        )}

        {value.scheduleType === 'hourly' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">at minute</span>
            <TimeSelect
              value={value.minute}
              onChange={(n) => onChange({ minute: n })}
              options={MINUTE_OPTIONS}
            />
          </div>
        )}

        {value.scheduleType === 'custom' && (
          <Input
            value={value.customRRule}
            onChange={(e) => onChange({ customRRule: e.target.value })}
            spellCheck={false}
            className="h-7 font-mono text-[11px]"
            placeholder={CUSTOM_RRULE_EXAMPLE}
          />
        )}
      </div>
    </div>
  );
}
