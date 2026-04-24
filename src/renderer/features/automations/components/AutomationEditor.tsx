import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileCode,
  Folder,
  GitBranch,
  History,
  Loader2,
  Pause,
  Play,
  Sparkles,
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
  UpdateAutomationInput,
} from '@shared/automations/types';
import AgentLogo from '@renderer/lib/components/agent-logo';
import { rpc } from '@renderer/lib/ipc';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/lib/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/lib/ui/popover';
import { Textarea } from '@renderer/lib/ui/textarea';
import { agentConfig } from '@renderer/utils/agentConfig';
import { cn } from '@renderer/utils/utils';
import { PromptInput } from './PromptInput';
import {
  scheduleLabel,
  SchedulePopoverBody,
  scheduleToState,
  stateToSchedule,
  type ScheduleFormValue,
} from './schedule-controls';
import {
  stateToTriggerConfig,
  TriggerPopoverBody,
  TriggerTypeIcon,
  type TriggerFormValue,
} from './trigger-controls';
import { useAutomationMemory, useRunLogs } from './useAutomations';
import { useDebouncedAutoSave, type AutoSaveState } from './useDebouncedAutoSave';
import {
  EASE_OUT,
  formatDateTime,
  formatRelative,
  formatRelativeFuture,
  TRIGGER_TYPE_LABELS,
} from './utils';

type EditorState = ScheduleFormValue &
  TriggerFormValue & {
    name: string;
    prompt: string;
    projectId: string;
    agentId: string;
    mode: AutomationMode;
    useWorktree: boolean;
  };

const EDITOR_STATE_KEYS = [
  'name',
  'prompt',
  'projectId',
  'agentId',
  'mode',
  'triggerType',
  'useWorktree',
  'assigneeFilter',
  'scheduleType',
  'hour',
  'minute',
  'dayOfWeek',
  'dayOfMonth',
  'customRRule',
] as const satisfies readonly (keyof EditorState)[];

function editorStatesEqual(a: EditorState, b: EditorState): boolean {
  for (const key of EDITOR_STATE_KEYS) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function canAutoSaveEditorState(form: EditorState): boolean {
  return Boolean(
    form.name.trim() &&
      form.prompt.trim() &&
      form.projectId &&
      form.agentId &&
      (form.mode !== 'schedule' || form.scheduleType !== 'custom' || form.customRRule.trim())
  );
}

const STATE_DEFAULTS = { hour: 9, minute: 0, dayOfWeek: 'mon', dayOfMonth: 1 } as const;

function automationToState(a: Automation): EditorState {
  return {
    ...scheduleToState(a.schedule, STATE_DEFAULTS),
    name: a.name,
    prompt: a.prompt,
    projectId: a.projectId,
    agentId: a.agentId,
    mode: a.mode,
    triggerType: a.triggerType ?? 'github_issue',
    useWorktree: a.useWorktree,
    assigneeFilter: a.triggerConfig?.assigneeFilter ?? '',
  };
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
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);
  const remoteSnapshotRef = useRef<EditorState>(automationToState(automation));
  const { flushPendingChanges, hasUnsavedChanges, replaceSavedValue, saveState } =
    useDebouncedAutoSave<EditorState>({
      value: form,
      isEqual: editorStatesEqual,
      canSave: canAutoSaveEditorState,
      onSave: async (snapshot) => {
        const updateInput: UpdateAutomationInput = {
          id: automation.id,
          name: snapshot.name.trim(),
          projectId: snapshot.projectId,
          prompt: snapshot.prompt.trim(),
          agentId: snapshot.agentId,
          mode: snapshot.mode,
          triggerType: snapshot.mode === 'trigger' ? snapshot.triggerType : null,
          triggerConfig: snapshot.mode === 'trigger' ? stateToTriggerConfig(snapshot) : null,
          useWorktree: snapshot.useWorktree,
        };
        if (snapshot.mode === 'schedule') {
          updateInput.schedule = stateToSchedule(snapshot);
        }
        await onUpdate(updateInput);
      },
    });

  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const replaceSavedValueRef = useRef(replaceSavedValue);
  const saveStateRef = useRef(saveState);
  useEffect(() => {
    hasUnsavedChangesRef.current = hasUnsavedChanges;
    replaceSavedValueRef.current = replaceSavedValue;
    saveStateRef.current = saveState;
  }, [hasUnsavedChanges, replaceSavedValue, saveState]);

  const handleBack = async () => {
    try {
      await flushPendingChanges();
    } finally {
      onBack();
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      void handleBack();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
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
    // Don't clobber local edits: skip if the form differs from the last saved
    // value OR if a save is still in flight (the queued value may not yet be
    // reflected in lastSavedRef when the refetch lands).
    if (hasUnsavedChangesRef.current(formRef.current)) return;
    if (saveStateRef.current === 'saving') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote updates should rehydrate the editor when there are no unsaved local edits
    setForm(next);
    replaceSavedValueRef.current(next);
  }, [automation]);

  const patch = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isPaused = automation.status === 'paused';

  return (
    <div className="flex h-full bg-background text-foreground">
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-4 shadow-[inset_0_-1px_0_rgb(0_0_0/0.06)] dark:shadow-[inset_0_-1px_0_rgb(255_255_255/0.06)]">
          <div className="flex min-w-0 items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={() => {
                void handleBack();
              }}
              disabled={saveState === 'saving'}
              className="relative inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 [transition:background-color_150ms,color_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)] before:absolute before:-inset-2 before:content-['']"
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
              className="w-full border-b border-transparent bg-transparent pb-4 text-2xl font-semibold transition-colors duration-150 placeholder:text-muted-foreground/50 focus:border-border/60 focus:outline-none"
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

      <aside className="flex w-[280px] shrink-0 flex-col overflow-y-auto bg-muted/10 shadow-[inset_1px_0_0_rgb(0_0_0/0.06)] dark:shadow-[inset_1px_0_0_rgb(255_255_255/0.06)]">
        <Section title="Status">
          <SidebarRow label="Status">
            <button
              type="button"
              onClick={onToggle}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-colors duration-150 hover:bg-muted active:scale-[0.97] [transition:background-color_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)]"
            >
              <StatusDot status={automation.status} />
              <span>{statusLabel(automation.status, isPaused)}</span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={isPaused ? 'paused' : 'active'}
                  initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                  animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
                  transition={{ duration: 0.16, ease: EASE_OUT }}
                  className="inline-flex"
                >
                  {isPaused ? (
                    <Play className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <Pause className="h-3 w-3 text-muted-foreground" />
                  )}
                </motion.span>
              </AnimatePresence>
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
                    icon={<Folder className="h-3.5 w-3.5" />}
                    label={selectedProject?.name ?? 'Select'}
                    muted={!selectedProject}
                  />
                }
              />
              <DropdownMenuContent
                align="end"
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
                      label={scheduleLabel(form, 'short')}
                    />
                  }
                />
                <PopoverContent
                  align="end"
                  className="w-auto min-w-[18rem] max-w-[22rem] p-0 overflow-hidden"
                >
                  <SchedulePopoverBody
                    value={form}
                    onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
                  />
                </PopoverContent>
              </Popover>
            </SidebarRow>
          )}

          <SidebarRow label="Agent">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarValueButton
                    label={selectedAgent?.name ?? 'Select'}
                    muted={!selectedAgent}
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
                    <TriggerPopoverBody
                      value={form}
                      onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
                    />
                  </PopoverContent>
                </Popover>
              </SidebarRow>
            </>
          )}
        </Section>

        <MemorySection automationId={automation.id} />

        <PreviousRunsSection automationId={automation.id} projectId={automation.projectId} />
      </aside>
    </div>
  );
};

function statusLabel(status: Automation['status'], isPaused: boolean): string {
  if (isPaused) return 'Paused';
  if (status === 'error') return 'Error';
  return 'Active';
}

function StatusDot({ status }: { status: Automation['status'] }) {
  if (status === 'paused') return <span className="h-2 w-2 rounded-full bg-orange-400" />;
  if (status === 'error') return <span className="h-2 w-2 rounded-full bg-destructive" />;
  return <span className="h-2 w-2 rounded-full bg-emerald-500" />;
}

function SaveIndicator({ state }: { state: AutoSaveState }) {
  return (
    <span className="ml-2 inline-flex h-[14px] min-w-[56px] items-center gap-1 text-[11px] text-muted-foreground">
      <AnimatePresence mode="wait" initial={false}>
        {state !== 'idle' && (
          <motion.span
            key={state}
            className="inline-flex items-center gap-1"
            initial={{ opacity: 0, filter: 'blur(2px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(2px)' }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            {state === 'saving' ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin [animation-duration:600ms]" /> Saving…
              </>
            ) : (
              <>
                <Check className="h-3 w-3" /> Saved
              </>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-3 shadow-[inset_0_-1px_0_rgb(0_0_0/0.05)] dark:shadow-[inset_0_-1px_0_rgb(255_255_255/0.05)]">
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
    label?: string;
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
        'group/sv inline-flex h-6 max-w-[160px] items-center gap-1.5 rounded px-1.5 text-xs transition-colors duration-150 hover:bg-muted active:scale-[0.97] [transition:background-color_150ms,color_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)]',
        muted && 'text-muted-foreground'
      )}
      {...rest}
    >
      {icon}
      {label && <span className="truncate">{label}</span>}
      <ChevronDown className="h-3 w-3 text-muted-foreground/60 transition-transform duration-150 ease-out group-data-[state=open]/sv:rotate-180 group-data-[popup-open]/sv:rotate-180" />
    </button>
  );
});

function MemorySection({ automationId }: { automationId: string }) {
  const { data, isLoading, save, clear, isSaving, isClearing } = useAutomationMemory(automationId);
  const showConfirmModal = useShowModal('confirmActionModal');
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const savedContent = data?.content ?? '';
  const effectiveDraft = draft ?? savedContent;
  const dirty = draft !== null && draft !== savedContent;
  const preview = savedContent
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .slice(0, 3)
    .join(' ');

  return (
    <div className="flex flex-col gap-1 px-3 py-3 shadow-[inset_0_-1px_0_rgb(0_0_0/0.05)] dark:shadow-[inset_0_-1px_0_rgb(255_255_255/0.05)]">
      <div className="mb-1 flex items-center justify-between px-1">
        <h3 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          Memory
        </h3>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="relative -my-1 -mr-1 rounded px-1.5 py-1 text-[10px] text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.95] [transition:background-color_150ms,color_150ms,transform_120ms_cubic-bezier(0.23,1,0.32,1)] before:absolute before:inset-[-8px] before:content-['']"
        >
          {expanded ? 'Hide' : 'Edit'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1.5 px-1 py-2">
          <div className="h-3 w-11/12 animate-pulse rounded bg-muted/50" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted/50" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted/50" />
        </div>
      ) : expanded ? (
        <motion.div
          initial={{ opacity: 0, y: 2 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: EASE_OUT }}
          className="flex flex-col gap-2 px-1"
        >
          <Textarea
            value={effectiveDraft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[140px] max-h-[320px] resize-y text-xs font-mono"
            placeholder="Notes that persist across runs…"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                showConfirmModal({
                  title: 'Reset memory?',
                  description:
                    'This replaces the saved memory with an empty template. This cannot be undone.',
                  confirmLabel: 'Reset',
                  variant: 'destructive',
                  onSuccess: () => {
                    void clear().then(() => setDraft(null));
                  },
                });
              }}
              disabled={isClearing}
              className="text-[11px] text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              Reset
            </button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => setDraft(null)}
                disabled={!dirty || isSaving}
              >
                Discard
              </Button>
              <Button
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => {
                  if (draft === null) return;
                  void save(draft).then(() => setDraft(null));
                }}
                disabled={!dirty || isSaving}
              >
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="flex flex-col gap-1 px-1">
          {preview ? (
            <p className="line-clamp-3 text-xs text-muted-foreground">{preview}</p>
          ) : (
            <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground/70">
              <Sparkles className="h-3 w-3" />
              <span>Agent will write notes here after the first run.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreviousRunsSection({
  automationId,
  projectId,
}: {
  automationId: string;
  projectId: string;
}) {
  const { data: logs = [], isPending } = useRunLogs(automationId, 20);
  const { navigate } = useNavigate();
  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
      <h3 className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Previous runs
      </h3>
      {isPending ? (
        <ul className="flex flex-col gap-0.5 px-1" aria-label="Loading runs">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded px-1 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <div className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-muted/50" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted/50" />
              </div>
              <div className="h-3 w-12 animate-pulse rounded bg-muted/40" />
            </li>
          ))}
        </ul>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-1 py-6 text-center">
          <History className="h-5 w-5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No runs yet</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {logs.map((log) => (
            <RunLogRow
              key={log.id}
              log={log}
              onOpen={
                log.taskId ? () => navigate('task', { projectId, taskId: log.taskId! }) : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RunLogRow({ log, onOpen }: { log: AutomationRunLog; onOpen?: () => void }) {
  const Icon =
    log.status === 'success' ? CheckCircle2 : log.status === 'failure' ? XCircle : Loader2;
  const iconClass =
    log.status === 'success'
      ? 'text-emerald-500'
      : log.status === 'failure'
        ? 'text-destructive'
        : 'text-blue-500 animate-spin [animation-duration:600ms]';
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={cn('h-3 w-3 shrink-0', iconClass)} />
        <span className="truncate">{log.status === 'running' ? 'Running' : log.status}</span>
      </div>
      <span className="tabular-nums text-muted-foreground" title={formatDateTime(log.startedAt)}>
        {formatRelative(log.startedAt)}
      </span>
    </>
  );
  if (!onOpen) {
    return (
      <li className="flex cursor-default items-center justify-between gap-2 rounded px-1 py-1.5 text-xs text-muted-foreground/80">
        {content}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-2 rounded px-1 py-1.5 text-left text-xs transition-[background-color,transform] duration-150 hover:bg-muted active:scale-[0.99]"
      >
        {content}
      </button>
    </li>
  );
}
