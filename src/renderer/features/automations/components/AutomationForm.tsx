import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, FileCode, FolderGit2, GitBranch, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { AGENT_PROVIDERS } from '@shared/agent-provider-registry';
import type {
  AutomationMode,
  AutomationSchedule,
  CreateAutomationInput,
  DayOfWeek,
  ScheduleType,
  TriggerConfig,
  TriggerType,
} from '@shared/automations/types';
import { ISSUE_PROVIDER_META } from '@renderer/features/integrations/issue-provider-meta';
import AgentLogo from '@renderer/lib/components/agent-logo';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/lib/ui/dropdown-menu';
import { Input } from '@renderer/lib/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/lib/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import { agentConfig } from '@renderer/utils/agentConfig';
import { cn } from '@renderer/utils/utils';
import { PromptInput } from './PromptInput';
import { TRIGGER_TYPE_LABELS } from './utils';

const DAYS: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_SHORT: Record<DayOfWeek, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};
const TRIGGER_TYPES: TriggerType[] = [
  'github_issue',
  'linear_issue',
  'jira_issue',
  'gitlab_issue',
  'forgejo_issue',
  'plain_thread',
];

function TriggerTypeIcon({
  triggerType,
  className,
}: {
  triggerType: TriggerType;
  className?: string;
}) {
  switch (triggerType) {
    case 'github_pr':
    case 'github_issue':
      return (
        <img
          src={ISSUE_PROVIDER_META.github.logo}
          alt="GitHub"
          className={cn(className, 'dark:invert')}
        />
      );
    case 'linear_issue':
      return (
        <img
          src={ISSUE_PROVIDER_META.linear.logo}
          alt="Linear"
          className={cn(className, 'dark:invert')}
        />
      );
    case 'jira_issue':
      return <img src={ISSUE_PROVIDER_META.jira.logo} alt="Jira" className={className} />;
    case 'gitlab_issue':
    case 'gitlab_mr':
      return <img src={ISSUE_PROVIDER_META.gitlab.logo} alt="GitLab" className={className} />;
    case 'forgejo_issue':
      return <img src={ISSUE_PROVIDER_META.forgejo.logo} alt="Forgejo" className={className} />;
    case 'plain_thread':
      return (
        <img
          src={ISSUE_PROVIDER_META.plain.logo}
          alt="Plain"
          className={cn(className, 'dark:invert')}
        />
      );
    default:
      return <Zap className={className} />;
  }
}

type FormState = {
  name: string;
  prompt: string;
  projectId: string;
  agentId: string;
  mode: AutomationMode;
  scheduleType: ScheduleType;
  hour: number;
  minute: number;
  dayOfWeek: DayOfWeek;
  dayOfMonth: number;
  triggerType: TriggerType;
  useWorktree: boolean;
  assigneeFilter: string;
};

const DEFAULT_STATE: FormState = {
  name: '',
  prompt: '',
  projectId: '',
  agentId: 'claude',
  mode: 'schedule',
  scheduleType: 'daily',
  hour: 9,
  minute: 0,
  dayOfWeek: 'mon',
  dayOfMonth: 1,
  triggerType: 'github_issue',
  useWorktree: true,
  assigneeFilter: '',
};

function seedToState(seed: Omit<CreateAutomationInput, 'projectId'>): FormState {
  const tc = seed.triggerConfig;
  const s = seed.schedule;
  return {
    ...DEFAULT_STATE,
    name: seed.name,
    prompt: seed.prompt,
    agentId: seed.agentId,
    mode: seed.mode ?? DEFAULT_STATE.mode,
    scheduleType: s.type,
    hour: s.hour ?? DEFAULT_STATE.hour,
    minute: s.minute ?? DEFAULT_STATE.minute,
    dayOfWeek: s.dayOfWeek ?? DEFAULT_STATE.dayOfWeek,
    dayOfMonth: s.dayOfMonth ?? DEFAULT_STATE.dayOfMonth,
    triggerType: seed.triggerType ?? DEFAULT_STATE.triggerType,
    useWorktree: seed.useWorktree ?? DEFAULT_STATE.useWorktree,
    assigneeFilter: tc?.assigneeFilter ?? '',
  };
}

function stateToSchedule(s: FormState): AutomationSchedule {
  return {
    type: s.scheduleType,
    hour: s.hour,
    minute: s.minute,
    ...(s.scheduleType === 'weekly' ? { dayOfWeek: s.dayOfWeek } : {}),
    ...(s.scheduleType === 'monthly' ? { dayOfMonth: s.dayOfMonth } : {}),
  };
}

function stateToTriggerConfig(s: FormState): TriggerConfig | null {
  const config: TriggerConfig = {};
  if (s.assigneeFilter.trim()) config.assigneeFilter = s.assigneeFilter.trim();
  return Object.keys(config).length > 0 ? config : null;
}

function scheduleLabel(s: FormState): string {
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  switch (s.scheduleType) {
    case 'hourly':
      return `Hourly :${String(s.minute).padStart(2, '0')}`;
    case 'daily':
      return `Daily at ${time}`;
    case 'weekly':
      return `${DAY_SHORT[s.dayOfWeek]} at ${time}`;
    case 'monthly':
      return `Day ${s.dayOfMonth} at ${time}`;
  }
}

function triggerFilterCount(s: FormState): number {
  return s.assigneeFilter.trim() ? 1 : 0;
}

type Props = {
  onCreate: (input: CreateAutomationInput) => Promise<unknown>;
  onCancel: () => void;
  isSubmitting: boolean;
  initialSeed?: Omit<CreateAutomationInput, 'projectId'>;
};

export const AutomationForm: React.FC<Props> = (props) => {
  const [form, setForm] = useState<FormState>(() =>
    props.initialSeed ? seedToState(props.initialSeed) : DEFAULT_STATE
  );

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', 'list'],
    queryFn: async () => rpc.projects.getProjects(),
  });

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSubmit =
    form.name.trim().length > 0 &&
    form.prompt.trim().length > 0 &&
    form.projectId.length > 0 &&
    form.agentId.length > 0 &&
    !props.isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const schedule = stateToSchedule(form);
    const triggerConfig = form.mode === 'trigger' ? stateToTriggerConfig(form) : null;

    try {
      const input: CreateAutomationInput = {
        name: form.name.trim(),
        projectId: form.projectId,
        prompt: form.prompt.trim(),
        agentId: form.agentId,
        mode: form.mode,
        schedule,
        useWorktree: form.useWorktree,
        ...(form.mode === 'trigger'
          ? {
              triggerType: form.triggerType,
              ...(triggerConfig ? { triggerConfig } : {}),
            }
          : {}),
      };
      await props.onCreate(input);
      setForm(DEFAULT_STATE);
    } catch {
      // toast handled in hook
    }
  };

  const handleCancel = () => {
    props.onCancel();
    setForm(DEFAULT_STATE);
  };

  const selectedAgent = agentConfig[form.agentId as keyof typeof agentConfig];
  const selectedProject = projects.find((p) => p.id === form.projectId);

  return (
    <div className="flex flex-col">
      <input
        type="text"
        value={form.name}
        onChange={(e) => patch('name', e.target.value)}
        placeholder="Automation title"
        className="w-full bg-transparent px-5 pt-5 pb-1 text-base font-medium placeholder:text-muted-foreground/60 focus:outline-none"
      />
      <PromptInput
        value={form.prompt}
        onValueChange={(v) => patch('prompt', v)}
        placeholder="Add prompt e.g. triage new issues in $github"
        minHeight={120}
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/30 px-4 py-2.5">
        {/* Worktree <-> Direct toggle with swoosh */}
        <PillButton
          active={form.useWorktree}
          onClick={() => patch('useWorktree', !form.useWorktree)}
          animatedKey={form.useWorktree ? 'worktree' : 'direct'}
          icon={
            form.useWorktree ? (
              <GitBranch className="h-3.5 w-3.5" />
            ) : (
              <FileCode className="h-3.5 w-3.5" />
            )
          }
          label={form.useWorktree ? 'Worktree' : 'Direct'}
        />

        {/* Agent selector */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <PillButton
                icon={
                  selectedAgent ? (
                    <AgentLogo
                      logo={selectedAgent.logo}
                      alt={selectedAgent.alt}
                      isSvg={selectedAgent.isSvg}
                      invertInDark={selectedAgent.invertInDark}
                      className="h-3.5 w-3.5"
                    />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )
                }
                label={selectedAgent?.name ?? 'Select agent'}
                hasChevron
              />
            }
          />
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {AGENT_PROVIDERS.map((p) => {
              const cfg = agentConfig[p.id];
              return (
                <DropdownMenuItem key={p.id} onClick={() => patch('agentId', p.id)}>
                  {cfg && (
                    <AgentLogo
                      logo={cfg.logo}
                      alt={cfg.alt}
                      isSvg={cfg.isSvg}
                      invertInDark={cfg.invertInDark}
                      className="h-4 w-4"
                    />
                  )}
                  <span className="flex-1">{cfg?.name ?? p.name}</span>
                  {form.agentId === p.id && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Project selector */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <PillButton
                icon={<FolderGit2 className="h-3.5 w-3.5" />}
                label={selectedProject?.name ?? 'Select project'}
                hasChevron
                muted={!selectedProject}
              />
            }
          />
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {projects.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No projects</div>
            ) : (
              projects.map((p) => (
                <DropdownMenuItem key={p.id} onClick={() => patch('projectId', p.id)}>
                  <FolderGit2 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{p.name}</span>
                  {form.projectId === p.id && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="mx-1 h-4 w-px bg-border/60" aria-hidden="true" />

        {/* Mode toggle (Schedule <-> Trigger) with swoosh */}
        <PillButton
          onClick={() => patch('mode', form.mode === 'schedule' ? 'trigger' : 'schedule')}
          animatedKey={form.mode}
          icon={
            form.mode === 'schedule' ? (
              <Clock className="h-3.5 w-3.5" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )
          }
          label={form.mode === 'schedule' ? 'Schedule' : 'Trigger'}
        />

        {/* Schedule or Trigger detail */}
        {form.mode === 'schedule' ? (
          <Popover>
            <PopoverTrigger render={<PillButton label={scheduleLabel(form)} hasChevron />} />
            <PopoverContent
              align="start"
              className="w-auto min-w-[18rem] max-w-[22rem] p-0 overflow-hidden"
            >
              <SchedulePopoverBody form={form} patch={patch} />
            </PopoverContent>
          </Popover>
        ) : (
          <Popover>
            <PopoverTrigger
              render={
                <PillButton
                  icon={<TriggerTypeIcon triggerType={form.triggerType} className="h-3.5 w-3.5" />}
                  label={TRIGGER_TYPE_LABELS[form.triggerType]}
                  hasChevron
                  badge={triggerFilterCount(form) > 0 ? triggerFilterCount(form) : undefined}
                />
              }
            />
            <PopoverContent align="start" className="w-[18rem] p-0 overflow-hidden">
              <TriggerPopoverBody form={form} patch={patch} />
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-background/30 px-4 py-3">
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
          {props.isSubmitting ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </div>
  );
};

type PillButtonProps = {
  label: string;
  icon?: React.ReactNode;
  active?: boolean;
  muted?: boolean;
  hasChevron?: boolean;
  badge?: number;
  onClick?: () => void;
  /** When provided, icon+label swoosh (swap up/down) whenever the key changes. */
  animatedKey?: string;
};

const PillButton = React.forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  { label, icon, active, muted, hasChevron, badge, onClick, animatedKey, ...rest },
  ref
) {
  const content = (
    <>
      {icon}
      <span className="truncate">{label}</span>
    </>
  );
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-transparent px-2 text-xs transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        active && 'border-border bg-muted text-foreground',
        !active && muted && 'text-muted-foreground'
      )}
      {...rest}
    >
      {animatedKey !== undefined ? (
        <span className="relative inline-flex h-4 items-center overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={animatedKey}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              {content}
            </motion.span>
          </AnimatePresence>
        </span>
      ) : (
        content
      )}
      {badge !== undefined && (
        <span className="tabular-nums rounded bg-primary/15 px-1 text-[10px] text-primary">
          {badge}
        </span>
      )}
      {hasChevron && <ChevronDown className="h-3 w-3 text-muted-foreground/70" />}
    </button>
  );
});

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
      {children}
    </div>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5);
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1);
const pad2 = (n: number) => String(n).padStart(2, '0');

function TimeSelect({
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
    <Select value={String(value)} onValueChange={(v) => v !== null && onChange(Number(v))}>
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

function SchedulePopoverBody({
  form,
  patch,
}: {
  form: FormState;
  patch: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <div className="flex flex-col px-3 py-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span>Run</span>
        <Select
          value={form.scheduleType}
          onValueChange={(v) => v !== null && patch('scheduleType', v as ScheduleType)}
        >
          <SelectTrigger className="h-7 w-[96px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hourly">Hourly</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>

        {form.scheduleType === 'weekly' && (
          <>
            <span>on</span>
            <Select
              value={form.dayOfWeek}
              onValueChange={(v) => v !== null && patch('dayOfWeek', v as DayOfWeek)}
            >
              <SelectTrigger className="h-7 w-[76px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DAY_SHORT[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {form.scheduleType === 'monthly' && (
          <>
            <span>on day</span>
            <Select
              value={String(form.dayOfMonth)}
              onValueChange={(v) => v !== null && patch('dayOfMonth', Number(v))}
            >
              <SelectTrigger className="h-7 w-[64px] text-xs tabular-nums">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {DAY_OF_MONTH_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)} className="tabular-nums">
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <span>at</span>
        {form.scheduleType !== 'hourly' && (
          <>
            <TimeSelect
              value={form.hour}
              onChange={(n) => patch('hour', n)}
              options={HOUR_OPTIONS}
            />
            <span className="text-foreground/60">:</span>
          </>
        )}
        <TimeSelect
          value={form.minute}
          onChange={(n) => patch('minute', n)}
          options={MINUTE_OPTIONS}
        />
        {form.scheduleType === 'hourly' && <span>min past the hour</span>}
      </div>
    </div>
  );
}

function TriggerPopoverBody({
  form,
  patch,
}: {
  form: FormState;
  patch: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-3 pb-2">
        <FieldRow label="Source">
          <Select
            value={form.triggerType}
            onValueChange={(v) => v !== null && patch('triggerType', v as TriggerType)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue>
                <div className="flex items-center gap-1.5">
                  <TriggerTypeIcon triggerType={form.triggerType} className="h-3.5 w-3.5" />
                  <span>{TRIGGER_TYPE_LABELS[form.triggerType]}</span>
                </div>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TRIGGER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  <div className="flex items-center gap-2">
                    <TriggerTypeIcon triggerType={t} className="h-4 w-4" />
                    <span>{TRIGGER_TYPE_LABELS[t]}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      </div>

      <div className="border-t border-border/60" />
      <SectionHeader>Filters</SectionHeader>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <FieldRow label="Assignee">
          <Input
            value={form.assigneeFilter}
            onChange={(e) => patch('assigneeFilter', e.target.value)}
            placeholder="username"
            className="h-7 text-xs"
          />
        </FieldRow>
      </div>

      <div className="border-t border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Polls every 60s · new items trigger a run · assignee filter only for now
      </div>
    </div>
  );
}
