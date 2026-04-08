import {
  Check,
  Clock,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Github,
  MoreHorizontal,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useEffect, useRef, useState } from 'react';
import type { AgentProviderId } from '@shared/agent-provider-registry';
import type {
  Automation,
  AutomationMode,
  CreateAutomationInput,
  ScheduleType,
  TriggerType,
  UpdateAutomationInput,
} from '@shared/automations/types';
import { INTEGRATION_LABELS } from '@shared/integrations/types';
import { agentConfig } from '@renderer/lib/agentConfig';
import { useIntegrationStatusMap } from '../../hooks/useIntegrationStatusMap';
import type { Agent } from '../../types';
import type { Project } from '../../types/app';
import { AgentSelector } from '../agent-selector';
import AgentLogo from '../AgentLogo';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Textarea } from '../ui/textarea';
import {
  buildSchedule,
  DAYS_OF_MONTH,
  DAYS_OF_WEEK,
  formatScheduleLabel,
  formatTriggerLabel,
  HOURS,
  MINUTES,
  SCHEDULE_TYPES,
  TRIGGER_INTEGRATION_MAP,
  TRIGGER_TYPES,
} from './utils';

interface AutomationInlineCreateProps {
  projects: Project[];
  prefill?: {
    name: string;
    prompt: string;
    mode?: AutomationMode;
    triggerType?: TriggerType;
  } | null;
  editingAutomation?: Automation | null;
  onSave: (input: CreateAutomationInput) => Promise<void>;
  onUpdate?: (input: UpdateAutomationInput) => Promise<void>;
  onCancel: () => void;
}

const AutomationInlineCreate: React.FC<AutomationInlineCreateProps> = ({
  projects,
  prefill,
  editingAutomation,
  onSave,
  onUpdate,
  onCancel,
}) => {
  const isEditing = !!editingAutomation;
  const { statuses: integrationStatuses } = useIntegrationStatusMap();

  const [name, setName] = useState(editingAutomation?.name ?? prefill?.name ?? '');
  const [projectId, setProjectId] = useState(editingAutomation?.projectId ?? projects[0]?.id ?? '');
  const [prompt, setPrompt] = useState(editingAutomation?.prompt ?? prefill?.prompt ?? '');
  const [agentId, setAgentId] = useState(editingAutomation?.agentId ?? 'claude');
  const [mode, setMode] = useState<AutomationMode>(
    editingAutomation?.mode ?? prefill?.mode ?? 'schedule'
  );
  const [triggerType, setTriggerType] = useState<TriggerType>(
    editingAutomation?.triggerType ?? prefill?.triggerType ?? 'github_pr'
  );
  const [branchFilter, setBranchFilter] = useState(
    editingAutomation?.triggerConfig?.branchFilter ?? ''
  );
  const [labelFilter, setLabelFilter] = useState(
    editingAutomation?.triggerConfig?.labelFilter?.join(', ') ?? ''
  );
  const [scheduleType, setScheduleType] = useState<ScheduleType>(
    editingAutomation?.schedule.type ?? 'daily'
  );
  const [hour, setHour] = useState(editingAutomation?.schedule.hour ?? 9);
  const [minute, setMinute] = useState(editingAutomation?.schedule.minute ?? 0);
  const [dayOfWeek, setDayOfWeek] = useState<string>(
    editingAutomation?.schedule.dayOfWeek ?? 'mon'
  );
  const [dayOfMonth, setDayOfMonth] = useState(editingAutomation?.schedule.dayOfMonth ?? 1);
  const [useWorktree, setUseWorktree] = useState(editingAutomation?.useWorktree ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  const userTouchedWorktreeRef = useRef(false);

  useEffect(() => {
    if (prefill && !isEditing && !initializedRef.current) {
      setName(prefill.name);
      setPrompt(prefill.prompt);
      if (prefill.mode) setMode(prefill.mode);
      if (prefill.triggerType) setTriggerType(prefill.triggerType);
      initializedRef.current = true;
    }
  }, [prefill, isEditing]);

  useEffect(() => {
    return () => {
      initializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const currentSchedule = buildSchedule(scheduleType, hour, minute, dayOfWeek, dayOfMonth);
  const schedulePreview = formatScheduleLabel(currentSchedule);

  let buttonLabel: string;
  if (isSaving) {
    buttonLabel = isEditing ? 'Saving…' : 'Creating…';
  } else {
    buttonLabel = isEditing ? 'Save' : 'Create';
  }

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!projectId) {
      setError('Select a project');
      return;
    }
    if (!prompt.trim()) {
      setError('Prompt is required');
      return;
    }

    setIsSaving(true);
    try {
      if (isEditing && !onUpdate) {
        throw new Error('onUpdate handler is required when editing an automation');
      }
      const parsedLabels = labelFilter
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const triggerCfg =
        mode === 'trigger'
          ? {
              branchFilter: branchFilter.trim() || undefined,
              labelFilter: parsedLabels.length > 0 ? parsedLabels : undefined,
            }
          : undefined;

      if (isEditing && editingAutomation && onUpdate) {
        await onUpdate({
          id: editingAutomation.id,
          name: name.trim(),
          projectId,
          prompt: prompt.trim(),
          agentId,
          mode,
          schedule: currentSchedule,
          triggerType: mode === 'trigger' ? triggerType : null,
          triggerConfig: triggerCfg ?? null,
          useWorktree,
        });
      } else {
        await onSave({
          name: name.trim(),
          projectId,
          prompt: prompt.trim(),
          agentId,
          mode,
          schedule: currentSchedule,
          triggerType: mode === 'trigger' ? triggerType : undefined,
          triggerConfig: triggerCfg,
          useWorktree,
        });
      }
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(isEditing ? 'Failed to save' : 'Failed to create');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const selectedProject = projects.find((p) => p.id === projectId);
  const selectedAgent = agentConfig[agentId as Agent];
  const hasGithub =
    selectedProject?.githubInfo?.connected && selectedProject?.githubInfo?.repository;

  return (
    <div
      className="mb-8 overflow-hidden rounded-lg border border-border/60 bg-muted/10"
      onKeyDown={handleKeyDown}
    >
      {/* Title row */}
      <div className="px-4 pb-0 pt-4">
        <Input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Automation title"
          className="!border-0 !bg-transparent !px-0 !text-sm !font-medium !shadow-none !outline-none !ring-0 placeholder:text-muted-foreground/40 focus:!border-transparent focus:!outline-none focus:!ring-0 focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
        />
      </div>

      {/* Prompt textarea */}
      <div className="px-4 pb-1">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Add prompt e.g. look for crashes in $sentry"
          className="min-h-[100px] resize-none !border-0 !bg-transparent !px-0 !text-sm !shadow-none !outline-none !ring-0 placeholder:text-muted-foreground/30 focus:!border-transparent focus:!outline-none focus:!ring-0 focus-visible:!border-transparent focus-visible:!outline-none focus-visible:!ring-0 focus-visible:!ring-offset-0"
        />
      </div>

      {error && (
        <div className="px-4 pb-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="bg-muted/10">
        {/* Config row — flat pills, hover only */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
          {/* Agent select — borderless to match flat row */}
          <AgentSelector
            value={agentId as AgentProviderId}
            onChange={(id) => setAgentId(id)}
            className="w-auto [&_button]:!h-7 [&_button]:!min-h-7 [&_button]:!w-auto [&_button]:!justify-center [&_button]:!gap-1.5 [&_button]:!rounded-md [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:!px-2 [&_button]:!py-0 [&_button]:!text-xs [&_button]:!text-muted-foreground [&_button]:hover:!bg-muted/60 [&_button_span]:!flex-none [&_button_span]:!text-center"
          />

          <span className="mx-1 h-3 w-px bg-border/60" aria-hidden />

          {/* Project dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 w-auto items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/60">
              {hasGithub ? (
                <Github className="h-3 w-3 shrink-0" />
              ) : (
                <FolderGit2 className="h-3 w-3 shrink-0" />
              )}
              <span className="max-w-[120px] truncate">
                {selectedProject?.name ?? 'Select project'}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[200px]">
              {projects.map((p) => {
                const pGh = p.githubInfo?.connected && p.githubInfo?.repository;
                return (
                  <DropdownMenuItem
                    key={p.id}
                    onClick={() => setProjectId(p.id)}
                    className="text-xs"
                  >
                    {pGh ? (
                      <Github className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <FolderGit2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1">{p.name}</span>
                    {projectId === p.id && <Check className="h-3 w-3 text-muted-foreground" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="mx-1 h-3 w-px bg-border/60" aria-hidden />

          {/* When pill — single fixed-width pill, no shift */}
          <Popover>
            <PopoverTrigger className="relative inline-flex h-7 w-auto items-center justify-center gap-1.5 overflow-hidden rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/60">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={`${mode}-${mode === 'trigger' ? triggerType : schedulePreview}`}
                  className="flex items-center justify-center gap-1.5"
                  initial={{ y: 10, opacity: 0, filter: 'blur(2px)' }}
                  animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                  exit={{ y: -10, opacity: 0, filter: 'blur(2px)' }}
                  transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                >
                  {mode === 'trigger' ? <Zap className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  <span className="max-w-[160px] truncate">
                    {mode === 'trigger' ? formatTriggerLabel(triggerType) : schedulePreview}
                  </span>
                </motion.span>
              </AnimatePresence>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] gap-0 p-0" align="start">
              {/* Mode swoosh toggle */}
              <div className="p-1">
                <div className="relative flex items-center rounded-md bg-muted/40 p-0.5">
                  {(['schedule', 'trigger'] as const).map((m) => {
                    const active = mode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 py-1 text-xs transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {active && (
                          <motion.span
                            layoutId="when-mode-pill"
                            className="absolute inset-0 rounded-[4px] bg-background shadow-sm ring-1 ring-border"
                            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                          />
                        )}
                        <span className="relative z-10 flex items-center gap-1.5">
                          {m === 'trigger' ? (
                            <Zap className="h-3 w-3" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                          {m === 'trigger' ? 'Trigger' : 'Schedule'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {mode === 'trigger' && (
                <>
                  <div className="relative">
                    <div className="max-h-[240px] overflow-y-auto px-1 pb-1">
                      {TRIGGER_TYPES.map((t) => {
                        const connected = integrationStatuses[t.integration];
                        const active = triggerType === t.value;
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setTriggerType(t.value as TriggerType)}
                            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-muted/60 ${active ? 'bg-muted/60' : ''}`}
                          >
                            <Zap className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="flex-1 truncate">{t.label}</span>
                            {!connected && (
                              <span className="shrink-0 text-[10px] text-muted-foreground/70">
                                Not connected
                              </span>
                            )}
                            {active && <Check className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          </button>
                        );
                      })}
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-background to-transparent" />
                  </div>
                  {(!integrationStatuses[TRIGGER_INTEGRATION_MAP[triggerType]] ||
                    triggerType === 'github_pr' ||
                    triggerType === 'github_issue' ||
                    triggerType === 'gitlab_issue' ||
                    triggerType === 'gitlab_mr' ||
                    triggerType === 'forgejo_issue') && (
                    <div className="space-y-2 border-t border-border/40 p-2">
                      {!integrationStatuses[TRIGGER_INTEGRATION_MAP[triggerType]] && (
                        <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                          Connect {INTEGRATION_LABELS[TRIGGER_INTEGRATION_MAP[triggerType]]} in
                          Settings → Integrations.
                        </p>
                      )}
                      {(triggerType === 'github_pr' ||
                        triggerType === 'github_issue' ||
                        triggerType === 'gitlab_issue' ||
                        triggerType === 'gitlab_mr' ||
                        triggerType === 'forgejo_issue') && (
                        <div className="flex gap-2">
                          <Input
                            value={branchFilter}
                            onChange={(e) => setBranchFilter(e.target.value)}
                            placeholder="Branch filter"
                            className="h-7 flex-1 text-xs"
                          />
                          <Input
                            value={labelFilter}
                            onChange={(e) => setLabelFilter(e.target.value)}
                            placeholder="Labels"
                            className="h-7 flex-1 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
              {mode === 'schedule' && (
                <div className="space-y-1.5 px-1.5 pb-1.5">
                  {/* Frequency as segmented buttons */}
                  <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
                    {SCHEDULE_TYPES.map((s) => {
                      const active = scheduleType === s.value;
                      const shortLabel = s.value === 'hourly' ? 'Hourly' : s.label;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => setScheduleType(s.value as ScheduleType)}
                          className={`relative flex-1 whitespace-nowrap rounded-[4px] px-2 py-1 text-xs transition-colors ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          {active && (
                            <motion.span
                              layoutId="schedule-active-pill"
                              className="absolute inset-0 rounded-[4px] bg-background shadow-sm ring-1 ring-border"
                              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                            />
                          )}
                          <span className="relative z-10">{shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Time row */}
                  <div className="flex items-center gap-2">
                    {scheduleType === 'weekly' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-7 flex-1 items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted/60">
                          <span className="truncate">
                            {DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label}
                          </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="min-w-[120px]">
                          {DAYS_OF_WEEK.map((d) => (
                            <DropdownMenuItem
                              key={d.value}
                              onClick={() => setDayOfWeek(d.value)}
                              className="text-xs"
                            >
                              <span className="flex-1">{d.label}</span>
                              {dayOfWeek === d.value && (
                                <Check className="h-3 w-3 text-muted-foreground" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    {scheduleType === 'monthly' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex h-7 flex-1 items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted/60">
                          <span className="truncate">
                            Day {DAYS_OF_MONTH.find((d) => d.value === dayOfMonth)?.label}
                          </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="max-h-[240px] min-w-[100px] overflow-y-auto">
                          {DAYS_OF_MONTH.map((d) => (
                            <DropdownMenuItem
                              key={d.value}
                              onClick={() => setDayOfMonth(d.value)}
                              className="text-xs"
                            >
                              <span className="flex-1">{d.label}</span>
                              {dayOfMonth === d.value && (
                                <Check className="h-3 w-3 text-muted-foreground" />
                              )}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}

                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {scheduleType === 'hourly' ? 'at minute' : 'at'}
                    </span>

                    {scheduleType === 'hourly' ? (
                      <Input
                        type="number"
                        min={0}
                        max={59}
                        value={minute}
                        onChange={(e) =>
                          setMinute(Math.max(0, Math.min(59, Number(e.target.value) || 0)))
                        }
                        className="!h-7 w-[64px] text-center text-xs tabular-nums"
                      />
                    ) : (
                      <Input
                        type="time"
                        value={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
                        onChange={(e) => {
                          const [h, m] = e.target.value.split(':');
                          setHour(Number(h) || 0);
                          setMinute(Number(m) || 0);
                        }}
                        className="!h-7 w-[90px] text-center text-xs tabular-nums [&::-webkit-calendar-picker-indicator]:hidden"
                      />
                    )}
                  </div>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <span className="mx-1 hidden h-3 w-px bg-border/60 md:inline-block" aria-hidden />

          {/* Worktree toggle — inline on wide, in overflow on narrow */}
          <button
            type="button"
            onClick={() => {
              userTouchedWorktreeRef.current = true;
              setUseWorktree(!useWorktree);
            }}
            className="relative hidden h-7 w-auto items-center justify-center overflow-hidden rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/60 md:inline-flex"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={useWorktree ? 'worktree' : 'direct'}
                className="flex items-center justify-center gap-1.5"
                initial={{ y: 12, opacity: 0, filter: 'blur(2px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -12, opacity: 0, filter: 'blur(2px)' }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              >
                {useWorktree ? (
                  <>
                    <GitBranch className="h-3 w-3" />
                    Worktree
                  </>
                ) : (
                  <>
                    <FolderOpen className="h-3 w-3" />
                    Direct
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </button>

          {/* Overflow menu (narrow only) */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 md:hidden">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-[180px]">
              <DropdownMenuItem
                onClick={() => {
                  userTouchedWorktreeRef.current = true;
                  setUseWorktree(!useWorktree);
                }}
                className="text-xs"
              >
                {useWorktree ? (
                  <GitBranch className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <FolderOpen className="h-3 w-3 text-muted-foreground" />
                )}
                <span className="flex-1">Use worktree</span>
                {useWorktree && <Check className="h-3 w-3 text-muted-foreground" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={handleSubmit}
              disabled={isSaving}
            >
              {buttonLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutomationInlineCreate;
