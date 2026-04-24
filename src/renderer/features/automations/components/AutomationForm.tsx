import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Clock, Cloud, FileCode, Folder, GitBranch, Zap } from 'lucide-react';
import React, { useState } from 'react';
import { AGENT_PROVIDERS } from '@shared/agent-provider-registry';
import type { AutomationMode, CreateAutomationInput } from '@shared/automations/types';
import AgentLogo from '@renderer/lib/components/agent-logo';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/lib/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/lib/ui/popover';
import { agentConfig } from '@renderer/utils/agentConfig';
import { cn } from '@renderer/utils/utils';
import { PromptInput } from './PromptInput';
import {
  CUSTOM_RRULE_EXAMPLE,
  scheduleLabel,
  SchedulePopoverBody,
  scheduleToState,
  stateToSchedule,
  type ScheduleFormValue,
} from './schedule-controls';
import {
  stateToTriggerConfig,
  triggerFilterCount,
  TriggerPopoverBody,
  TriggerTypeIcon,
  type TriggerFormValue,
} from './trigger-controls';
import { EASE_OUT, TRIGGER_TYPE_LABELS } from './utils';

type FormState = ScheduleFormValue &
  TriggerFormValue & {
    name: string;
    prompt: string;
    projectId: string;
    agentId: string;
    mode: AutomationMode;
    useWorktree: boolean;
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
  customRRule: CUSTOM_RRULE_EXAMPLE,
  triggerType: 'github_issue',
  useWorktree: true,
  assigneeFilter: '',
};

const DRAFT_STORAGE_KEY = 'emdash:new-automation:draft';

function formStateFromStoredDraft(raw: string | null): FormState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<FormState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      name: typeof parsed.name === 'string' ? parsed.name : DEFAULT_STATE.name,
      prompt: typeof parsed.prompt === 'string' ? parsed.prompt : DEFAULT_STATE.prompt,
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : DEFAULT_STATE.projectId,
      agentId: typeof parsed.agentId === 'string' ? parsed.agentId : DEFAULT_STATE.agentId,
      customRRule:
        typeof parsed.customRRule === 'string' ? parsed.customRRule : DEFAULT_STATE.customRRule,
      assigneeFilter:
        typeof parsed.assigneeFilter === 'string'
          ? parsed.assigneeFilter
          : DEFAULT_STATE.assigneeFilter,
    };
  } catch {
    return null;
  }
}

function saveDraft(form: FormState): void {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
  } catch {
    // Draft persistence is best-effort.
  }
}

function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Draft persistence is best-effort.
  }
}

function loadDraft(): FormState | null {
  try {
    return formStateFromStoredDraft(localStorage.getItem(DRAFT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function seedToState(seed: Omit<CreateAutomationInput, 'projectId'>): FormState {
  return {
    ...DEFAULT_STATE,
    ...(seed.schedule ? scheduleToState(seed.schedule, DEFAULT_STATE) : {}),
    name: seed.name,
    prompt: seed.prompt,
    agentId: seed.agentId,
    mode: seed.mode ?? DEFAULT_STATE.mode,
    triggerType: seed.triggerType ?? DEFAULT_STATE.triggerType,
    useWorktree: seed.useWorktree ?? DEFAULT_STATE.useWorktree,
    assigneeFilter: seed.triggerConfig?.assigneeFilter ?? '',
  };
}

type Props = {
  onCreate: (input: CreateAutomationInput) => Promise<unknown>;
  onCancel: () => void;
  isSubmitting: boolean;
  initialSeed?: Omit<CreateAutomationInput, 'projectId'>;
};

export const AutomationForm: React.FC<Props> = (props) => {
  const [form, setForm] = useState<FormState>(() =>
    props.initialSeed ? seedToState(props.initialSeed) : (loadDraft() ?? DEFAULT_STATE)
  );

  const { data: projects = [] } = useQuery({
    queryKey: ['projects', 'list'],
    queryFn: async () => rpc.projects.getProjects(),
  });

  const setAndSaveForm = (next: React.SetStateAction<FormState>) => {
    setForm((prev) => {
      const nextForm = typeof next === 'function' ? next(prev) : next;
      if (!props.initialSeed) saveDraft(nextForm);
      return nextForm;
    });
  };

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setAndSaveForm((prev) => ({ ...prev, [key]: value }));

  const canSubmit =
    form.name.trim().length > 0 &&
    form.prompt.trim().length > 0 &&
    form.projectId.length > 0 &&
    form.agentId.length > 0 &&
    (form.mode !== 'schedule' ||
      form.scheduleType !== 'custom' ||
      form.customRRule.trim().length > 0) &&
    !props.isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const triggerConfig = form.mode === 'trigger' ? stateToTriggerConfig(form) : null;

    try {
      const input: CreateAutomationInput = {
        name: form.name.trim(),
        projectId: form.projectId,
        prompt: form.prompt.trim(),
        agentId: form.agentId,
        mode: form.mode,
        useWorktree: form.useWorktree,
        ...(form.mode === 'schedule' ? { schedule: stateToSchedule(form) } : {}),
        ...(form.mode === 'trigger'
          ? {
              triggerType: form.triggerType,
              ...(triggerConfig ? { triggerConfig } : {}),
            }
          : {}),
      };
      await props.onCreate(input);
      clearDraft();
      setForm(DEFAULT_STATE);
    } catch {
      // toast handled in hook
    }
  };

  const handleCancel = () => {
    props.onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    if (e.target instanceof Node && !e.currentTarget.contains(e.target)) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const selectedAgent = agentConfig[form.agentId as keyof typeof agentConfig];
  const selectedProject = projects.find((p) => p.id === form.projectId);

  return (
    <div className="flex flex-col" onKeyDown={handleKeyDown}>
      <input
        type="text"
        value={form.name}
        onChange={(e) => patch('name', e.target.value)}
        placeholder="Automation title"
        className="w-full bg-transparent px-5 pt-5 pb-1 text-base font-medium placeholder:text-muted-foreground/60 focus:outline-none"
        autoFocus
      />
      <PromptInput
        value={form.prompt}
        onValueChange={(v) => patch('prompt', v)}
        placeholder="Add prompt e.g. triage new issues in $github"
        minHeight={120}
      />

      <div className="flex items-center gap-3 bg-background/30 px-4 py-2.5 pr-3 shadow-[inset_0_1px_0_rgb(0_0_0/0.06)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {/* Group 1: Run context (worktree + project) */}
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <PillButton
                    icon={
                      form.useWorktree ? (
                        <GitBranch className="h-3.5 w-3.5" />
                      ) : (
                        <FileCode className="h-3.5 w-3.5" />
                      )
                    }
                    label={form.useWorktree ? 'Worktree' : 'Direct'}
                    hasChevron
                  />
                }
              />
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => patch('useWorktree', false)}>
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Direct</span>
                  {!form.useWorktree && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => patch('useWorktree', true)}>
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Worktree</span>
                  {form.useWorktree && <Check className="h-3.5 w-3.5" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled
                  className="opacity-50 cursor-not-allowed focus:bg-transparent"
                >
                  <Cloud className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Cloud</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] whitespace-nowrap text-muted-foreground">
                    Coming soon
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <PillButton
                    icon={<Folder className="h-3.5 w-3.5" />}
                    label={selectedProject?.name ?? 'Select project'}
                    hasChevron
                    muted={!selectedProject}
                  />
                }
              />
              <DropdownMenuContent
                align="start"
                className="max-h-72 w-auto min-w-[14rem] overflow-y-auto"
              >
                {projects.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No projects</div>
                ) : (
                  projects.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => patch('projectId', p.id)}>
                      <Folder className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1">{p.name}</span>
                      {form.projectId === p.id && <Check className="h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="h-4 w-px shrink-0 bg-border/40" />

          {/* Group 2: When (schedule or trigger) */}
          <div className="flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger
                render={
                  <PillButton
                    icon={
                      form.mode === 'schedule' ? (
                        <Clock className="h-3.5 w-3.5" />
                      ) : (
                        <TriggerTypeIcon triggerType={form.triggerType} className="h-3.5 w-3.5" />
                      )
                    }
                    label={
                      form.mode === 'schedule'
                        ? scheduleLabel(form)
                        : TRIGGER_TYPE_LABELS[form.triggerType]
                    }
                    hasChevron
                    badge={
                      form.mode === 'trigger' && triggerFilterCount(form) > 0
                        ? triggerFilterCount(form)
                        : undefined
                    }
                  />
                }
              />
              <PopoverContent
                align="start"
                className="w-auto min-w-[18rem] max-w-[22rem] overflow-hidden p-0"
              >
                <ModeTabs mode={form.mode} onChange={(m) => patch('mode', m)} />
                <motion.div
                  layout
                  transition={{ duration: 0.18, ease: EASE_OUT }}
                  className="overflow-hidden"
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.div
                      key={form.mode}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.1, ease: 'linear' }}
                    >
                      {form.mode === 'schedule' ? (
                        <SchedulePopoverBody
                          value={form}
                          onChange={(next) => setAndSaveForm((prev) => ({ ...prev, ...next }))}
                        />
                      ) : (
                        <TriggerPopoverBody
                          value={form}
                          onChange={(next) => setAndSaveForm((prev) => ({ ...prev, ...next }))}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="h-4 w-px shrink-0 bg-border/40" />

          {/* Group 3: Agent */}
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <PillButton
                    title={selectedAgent?.name ?? 'Agent'}
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
                  />
                }
              />
              <DropdownMenuContent align="end" className="max-h-72 min-w-52 overflow-y-auto">
                {AGENT_PROVIDERS.map((p) => {
                  const cfg = agentConfig[p.id];
                  return (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => patch('agentId', p.id)}
                      className="py-2"
                    >
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
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleCancel} className="h-7 px-2 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-7 px-3 text-xs"
          >
            {props.isSubmitting ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </div>
    </div>
  );
};

function ModeTabs({
  mode,
  onChange,
}: {
  mode: AutomationMode;
  onChange: (mode: AutomationMode) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 border-b border-border/60 bg-background/20 p-1.5">
      <button
        type="button"
        onClick={() => onChange('schedule')}
        className={cn(
          'inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium active:scale-[0.97] [transition:background-color_150ms,color_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)]',
          mode === 'schedule'
            ? 'bg-background-quaternary-1 text-foreground shadow-xs'
            : 'text-muted-foreground hover:bg-background-quaternary/70 hover:text-foreground'
        )}
      >
        <Clock className="h-3 w-3" />
        Schedule
      </button>
      <button
        type="button"
        onClick={() => onChange('trigger')}
        className={cn(
          'inline-flex h-7 items-center justify-center gap-1.5 rounded-md text-[11px] font-medium active:scale-[0.97] [transition:background-color_150ms,color_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)]',
          mode === 'trigger'
            ? 'bg-background-quaternary-1 text-foreground shadow-xs'
            : 'text-muted-foreground hover:bg-background-quaternary/70 hover:text-foreground'
        )}
      >
        <Zap className="h-3 w-3" />
        Trigger
      </button>
    </div>
  );
}

type PillButtonProps = {
  label?: string;
  icon?: React.ReactNode;
  active?: boolean;
  muted?: boolean;
  hasChevron?: boolean;
  badge?: number;
  onClick?: () => void;
  title?: string;
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
      {label && <span className="truncate">{label}</span>}
    </>
  );
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      className={cn(
        'group/pb inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-transparent px-2 text-xs active:scale-[0.97]',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        '[transition:background-color_150ms,border-color_150ms,color_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)]',
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
              transition={{ duration: 0.22, ease: EASE_OUT }}
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
      {hasChevron && (
        <ChevronDown className="h-3 w-3 text-muted-foreground/70 transition-transform duration-150 ease-out group-data-[state=open]/pb:rotate-180 group-data-[popup-open]/pb:rotate-180" />
      )}
    </button>
  );
});
