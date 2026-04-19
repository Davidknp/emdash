import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileCode,
  FolderGit2,
  GitBranch,
  History,
  Loader2,
  Pause,
  Play,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { AGENT_PROVIDERS } from '@shared/agent-provider-registry';
import type {
  Automation,
  AutomationMode,
  AutomationRunLog,
  AutomationSchedule,
  DayOfWeek,
  ScheduleType,
  TriggerConfig,
  TriggerType,
  UpdateAutomationInput,
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
import { useIsAutomationRunning, useRunLogs } from './useAutomations';
import { useDebouncedAutoSave, type AutoSaveState } from './useDebouncedAutoSave';
import { formatDateTime, formatRelative, formatRelativeFuture, TRIGGER_TYPE_LABELS } from './utils';

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

type EditorState = {
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

function editorStatesEqual(a: EditorState, b: EditorState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function canAutoSaveEditorState(form: EditorState): boolean {
  return Boolean(form.name.trim() && form.prompt.trim() && form.projectId && form.agentId);
}

function automationToState(a: Automation): EditorState {
  return {
    name: a.name,
    prompt: a.prompt,
    projectId: a.projectId,
    agentId: a.agentId,
    mode: a.mode,
    scheduleType: a.schedule.type,
    hour: a.schedule.hour ?? 9,
    minute: a.schedule.minute ?? 0,
    dayOfWeek: a.schedule.dayOfWeek ?? 'mon',
    dayOfMonth: a.schedule.dayOfMonth ?? 1,
    triggerType: a.triggerType ?? 'github_issue',
    useWorktree: a.useWorktree,
    assigneeFilter: a.triggerConfig?.assigneeFilter ?? '',
  };
}

function stateToSchedule(s: EditorState): AutomationSchedule {
  return {
    type: s.scheduleType,
    hour: s.hour,
    minute: s.minute,
    ...(s.scheduleType === 'weekly' ? { dayOfWeek: s.dayOfWeek } : {}),
    ...(s.scheduleType === 'monthly' ? { dayOfMonth: s.dayOfMonth } : {}),
  };
}

function stateToTriggerConfig(s: EditorState): TriggerConfig | null {
  const config: TriggerConfig = {};
  if (s.assigneeFilter.trim()) config.assigneeFilter = s.assigneeFilter.trim();
  return Object.keys(config).length > 0 ? config : null;
}

function scheduleSummary(s: EditorState): string {
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`;
  switch (s.scheduleType) {
    case 'hourly':
      return `Hourly :${String(s.minute).padStart(2, '0')}`;
    case 'daily':
      return `Daily ${time}`;
    case 'weekly':
      return `${DAY_SHORT[s.dayOfWeek]} ${time}`;
    case 'monthly':
      return `Day ${s.dayOfMonth} ${time}`;
  }
}

type Props = {
  automation: Automation;
  onBack: () => void;
  onUpdate: (input: UpdateAutomationInput) => Promise<unknown>;
  onDelete: () => void;
  onToggle: () => void;
  onTriggerNow: () => void;
  isBusy: boolean;
};

export const AutomationEditor: React.FC<Props> = ({
  automation,
  onBack,
  onUpdate,
  onDelete,
  onToggle,
  onTriggerNow,
  isBusy,
}) => {
  const [form, setForm] = useState<EditorState>(() => automationToState(automation));
  const remoteSnapshotRef = useRef<EditorState>(automationToState(automation));
  const isRunning = useIsAutomationRunning(automation.id);
  const { flushPendingChanges, hasUnsavedChanges, replaceSavedValue, saveState } =
    useDebouncedAutoSave<EditorState>({
      value: form,
      isEqual: editorStatesEqual,
      canSave: canAutoSaveEditorState,
      onSave: async (snapshot) => {
        await onUpdate({
          id: automation.id,
          name: snapshot.name.trim(),
          projectId: snapshot.projectId,
          prompt: snapshot.prompt.trim(),
          agentId: snapshot.agentId,
          mode: snapshot.mode,
          schedule: stateToSchedule(snapshot),
          triggerType: snapshot.mode === 'trigger' ? snapshot.triggerType : null,
          triggerConfig: snapshot.mode === 'trigger' ? stateToTriggerConfig(snapshot) : null,
          useWorktree: snapshot.useWorktree,
        });
      },
    });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', 'list'],
    queryFn: async () => rpc.projects.getProjects(),
  });

  const selectedAgent = agentConfig[form.agentId as keyof typeof agentConfig];
  const selectedProject = projects.find((p) => p.id === form.projectId);

  // Reconcile when the upstream automation changes (e.g. another tab/save).
  useEffect(() => {
    const next = automationToState(automation);
    const same = editorStatesEqual(next, remoteSnapshotRef.current);
    remoteSnapshotRef.current = next;
    if (same) return;
    // Only overwrite local state if user has no pending unsaved edits.
    if (!hasUnsavedChanges(form)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- remote updates should rehydrate the editor when there are no unsaved local edits
      setForm(next);
      replaceSavedValue(next);
    }
  }, [automation, form, hasUnsavedChanges, replaceSavedValue]);

  const patch = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isPaused = automation.status === 'paused';

  return (
    <div className="flex h-full bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={() => {
                void flushPendingChanges();
                onBack();
              }}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Automations
            </button>
            <span className="text-muted-foreground/50">/</span>
            <span className="truncate font-medium">{form.name || 'Untitled'}</span>
            <SaveIndicator state={saveState} />
          </div>
          <div className="flex items-center gap-1">
            {form.mode === 'schedule' && (
              <Button variant="outline" size="sm" onClick={onTriggerNow} disabled={isBusy}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Run now
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              disabled={isBusy}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-8 py-8">
            <input
              type="text"
              value={form.name}
              onChange={(e) => patch('name', e.target.value)}
              placeholder="Untitled automation"
              className="w-full bg-transparent pb-4 text-2xl font-semibold placeholder:text-muted-foreground/50 focus:outline-none"
            />
            <PromptInput
              value={form.prompt}
              onValueChange={(v) => patch('prompt', v)}
              placeholder="Add prompt e.g. triage new issues in $github"
              minHeight={200}
              className="-mx-5"
            />
          </div>
        </div>
      </main>

      <aside className="flex w-[280px] shrink-0 flex-col border-l border-border/60 overflow-y-auto">
        <Section title="Status">
          <SidebarRow label="Status">
            <button
              type="button"
              onClick={onToggle}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs hover:bg-muted"
            >
              <StatusDot status={automation.status} running={isRunning} />
              <span>
                {isRunning
                  ? 'Running'
                  : isPaused
                    ? 'Paused'
                    : automation.status === 'error'
                      ? 'Error'
                      : 'Active'}
              </span>
              {isPaused ? (
                <Play className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Pause className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </SidebarRow>
          {form.mode === 'schedule' && (
            <SidebarRow label="Next run">
              <span className="text-xs tabular-nums text-muted-foreground">
                {isPaused ? '—' : formatRelativeFuture(automation.nextRunAt)}
              </span>
            </SidebarRow>
          )}
          <SidebarRow label="Last ran">
            <span
              className="text-xs tabular-nums text-muted-foreground"
              title={automation.lastRunAt ? formatDateTime(automation.lastRunAt) : undefined}
            >
              {formatRelative(automation.lastRunAt)}
            </span>
          </SidebarRow>
        </Section>

        <Section title="Details">
          <SidebarRow label="Runs in">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarValueButton
                    icon={
                      form.useWorktree ? (
                        <GitBranch className="h-3.5 w-3.5" />
                      ) : (
                        <FileCode className="h-3.5 w-3.5" />
                      )
                    }
                    label={form.useWorktree ? 'Worktree' : 'Direct'}
                  />
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => patch('useWorktree', true)}>
                  <GitBranch className="h-4 w-4" />
                  <span className="flex-1">Worktree</span>
                  {form.useWorktree && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => patch('useWorktree', false)}>
                  <FileCode className="h-4 w-4" />
                  <span className="flex-1">Direct</span>
                  {!form.useWorktree && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarRow>

          <SidebarRow label="Project">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarValueButton
                    icon={<FolderGit2 className="h-3.5 w-3.5" />}
                    label={selectedProject?.name ?? 'Select'}
                    muted={!selectedProject}
                  />
                }
              />
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
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
          </SidebarRow>

          <SidebarRow label="Mode">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarValueButton
                    icon={
                      form.mode === 'schedule' ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )
                    }
                    label={form.mode === 'schedule' ? 'Schedule' : 'Trigger'}
                  />
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => patch('mode', 'schedule')}>
                  <Clock className="h-4 w-4" />
                  <span className="flex-1">Schedule</span>
                  {form.mode === 'schedule' && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => patch('mode', 'trigger')}>
                  <Zap className="h-4 w-4" />
                  <span className="flex-1">Trigger</span>
                  {form.mode === 'trigger' && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarRow>

          {form.mode === 'schedule' && (
            <SidebarRow label="Repeats">
              <Popover>
                <PopoverTrigger
                  render={
                    <SidebarValueButton
                      icon={<Clock className="h-3.5 w-3.5" />}
                      label={scheduleSummary(form)}
                    />
                  }
                />
                <PopoverContent
                  align="end"
                  className="w-auto min-w-[18rem] max-w-[22rem] p-0 overflow-hidden"
                >
                  <SchedulePopoverBody form={form} patch={patch} />
                </PopoverContent>
              </Popover>
            </SidebarRow>
          )}

          <SidebarRow label="Agent">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarValueButton
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
                    label={selectedAgent?.name ?? 'Select'}
                  />
                }
              />
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
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
          </SidebarRow>

          {form.mode === 'trigger' && (
            <>
              <SidebarRow label="Trigger">
                <Popover>
                  <PopoverTrigger
                    render={
                      <SidebarValueButton
                        icon={
                          <TriggerTypeIcon triggerType={form.triggerType} className="h-3.5 w-3.5" />
                        }
                        label={TRIGGER_TYPE_LABELS[form.triggerType]}
                      />
                    }
                  />
                  <PopoverContent align="end" className="w-[18rem] p-0 overflow-hidden">
                    <TriggerPopoverBody form={form} patch={patch} />
                  </PopoverContent>
                </Popover>
              </SidebarRow>
            </>
          )}
        </Section>

        <PreviousRunsSection automationId={automation.id} />
      </aside>
    </div>
  );
};

function StatusDot({ status, running }: { status: Automation['status']; running: boolean }) {
  if (running) return <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />;
  if (status === 'paused') return <span className="h-2 w-2 rounded-full bg-orange-400" />;
  if (status === 'error') return <span className="h-2 w-2 rounded-full bg-destructive" />;
  return <span className="h-2 w-2 rounded-full bg-emerald-500" />;
}

function SaveIndicator({ state }: { state: AutoSaveState }) {
  if (state === 'idle') return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      {state === 'saving' ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </>
      ) : (
        <>
          <Check className="h-3 w-3" /> Saved
        </>
      )}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/40 px-3 py-3">
      <h3 className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h3>
      {children}
    </div>
  );
}

function SidebarRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded px-1 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const SidebarValueButton = React.forwardRef<
  HTMLButtonElement,
  {
    label: string;
    icon?: React.ReactNode;
    muted?: boolean;
    onClick?: () => void;
  }
>(function SidebarValueButton({ label, icon, muted, onClick, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-6 max-w-[160px] items-center gap-1.5 rounded px-1.5 text-xs transition-colors hover:bg-muted',
        muted && 'text-muted-foreground'
      )}
      {...rest}
    >
      {icon}
      <span className="truncate">{label}</span>
      <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
    </button>
  );
});

function PreviousRunsSection({ automationId }: { automationId: string }) {
  const { data: logs = [], isPending } = useRunLogs(automationId, 20);
  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <h3 className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Previous runs
      </h3>
      {isPending ? (
        <div className="px-1 py-2 text-xs text-muted-foreground">Loading…</div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-1 py-6 text-center">
          <History className="h-5 w-5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No runs yet</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {logs.map((log) => (
            <RunLogRow key={log.id} log={log} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RunLogRow({ log }: { log: AutomationRunLog }) {
  const Icon =
    log.status === 'success' ? CheckCircle2 : log.status === 'failure' ? XCircle : Loader2;
  const iconClass =
    log.status === 'success'
      ? 'text-emerald-500'
      : log.status === 'failure'
        ? 'text-destructive'
        : 'text-blue-500 animate-spin';
  return (
    <li className="flex items-center justify-between gap-2 rounded px-1 py-1.5 text-xs hover:bg-muted">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={cn('h-3 w-3 shrink-0', iconClass)} />
        <span className="truncate">{log.status === 'running' ? 'Running' : log.status}</span>
      </div>
      <span className="tabular-nums text-muted-foreground" title={formatDateTime(log.startedAt)}>
        {formatRelative(log.startedAt)}
      </span>
    </li>
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
  form: EditorState;
  patch: <K extends keyof EditorState>(key: K, value: EditorState[K]) => void;
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
  form: EditorState;
  patch: <K extends keyof EditorState>(key: K, value: EditorState[K]) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2.5">
          <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Source</span>
          <div className="min-w-0 flex-1">
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
          </div>
        </div>
      </div>

      <div className="border-t border-border/60" />
      <div className="px-3 pt-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Filters
      </div>
      <div className="flex flex-col gap-2 px-3 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Assignee</span>
          <div className="min-w-0 flex-1">
            <Input
              value={form.assigneeFilter}
              onChange={(e) => patch('assigneeFilter', e.target.value)}
              placeholder="username"
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Polls every 60s · new items trigger a run · assignee filter only for now
      </div>
    </div>
  );
}
