import { Check, Clock, FolderGit2, FolderOpen, GitBranch, Github, Zap } from 'lucide-react';
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
          className="border-0 bg-transparent px-0 text-sm font-medium placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {/* Prompt textarea */}
      <div className="px-4 pb-3">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Add prompt e.g. look for crashes in $sentry"
          className="min-h-[100px] resize-none border-0 bg-transparent px-0 text-sm placeholder:text-muted-foreground/30 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {error && (
        <div className="px-4 pb-2">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="border-t border-border/40 bg-muted/20">
        {/* Config row — wraps when space is tight */}
        <div className="flex flex-wrap items-center gap-1 px-3 pb-1 pt-2">
          {/* Worktree toggle */}
          <Button
            type="button"
            variant={useWorktree ? 'secondary' : 'ghost'}
            size="sm"
            className="relative h-7 w-[88px] overflow-hidden text-xs text-muted-foreground"
            onClick={() => {
              userTouchedWorktreeRef.current = true;
              setUseWorktree(!useWorktree);
            }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={useWorktree ? 'worktree' : 'main'}
                className="flex items-center justify-center gap-1.5"
                initial={{ y: 12, opacity: 0, filter: 'blur(2px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -12, opacity: 0, filter: 'blur(2px)' }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              >
                {useWorktree ? (
                  <>
                    <GitBranch className="h-3 w-3 shrink-0" />
                    Worktree
                  </>
                ) : (
                  <>
                    <FolderOpen className="h-3 w-3 shrink-0" />
                    Direct
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </Button>

          {/* Agent select — same combobox used in settings */}
          <AgentSelector
            value={agentId as AgentProviderId}
            onChange={(id) => setAgentId(id)}
            className="h-7 w-[160px]"
          />

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

          {/* Mode toggle */}
          <Button
            type="button"
            variant={mode === 'trigger' ? 'secondary' : 'ghost'}
            size="sm"
            className="relative h-7 w-[88px] overflow-hidden text-xs text-muted-foreground"
            onClick={() => setMode(mode === 'trigger' ? 'schedule' : 'trigger')}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={mode}
                className="flex items-center justify-center gap-1.5"
                initial={{ y: 12, opacity: 0, filter: 'blur(2px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -12, opacity: 0, filter: 'blur(2px)' }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              >
                {mode === 'trigger' ? (
                  <>
                    <Zap className="h-3 w-3 shrink-0" />
                    Trigger
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3 shrink-0" />
                    Schedule
                  </>
                )}
              </motion.span>
            </AnimatePresence>
          </Button>

          {/* Trigger config */}
          {mode === 'trigger' && (
            <Popover>
              <PopoverTrigger className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/60">
                <Zap className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{formatTriggerLabel(triggerType)}</span>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <div className="border-b border-border/40 px-3 py-2.5">
                  <p className="text-xs font-medium">Trigger Event</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Choose when this automation fires
                  </p>
                </div>
                <div className="space-y-3 p-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Event type
                    </label>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-8 w-full items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted/60">
                        <span className="truncate">{formatTriggerLabel(triggerType)}</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="min-w-[260px]">
                        {TRIGGER_TYPES.map((t) => {
                          const connected = integrationStatuses[t.integration];
                          return (
                            <DropdownMenuItem
                              key={t.value}
                              onClick={() => setTriggerType(t.value as TriggerType)}
                              className="text-xs"
                            >
                              <span className="flex flex-1 items-center gap-2">
                                {t.label}
                                {!connected && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                    <span className="h-1 w-1 rounded-full bg-amber-500" />
                                    Setup required
                                  </span>
                                )}
                              </span>
                              {triggerType === t.value && (
                                <Check className="h-3 w-3 text-muted-foreground" />
                              )}
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {!integrationStatuses[TRIGGER_INTEGRATION_MAP[triggerType]] && (
                    <p className="rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-600 dark:text-amber-400">
                      {INTEGRATION_LABELS[TRIGGER_INTEGRATION_MAP[triggerType]]} needs to be set up.
                      Connect it in Settings → Integrations for this trigger to work.
                    </p>
                  )}
                  {(triggerType === 'github_pr' ||
                    triggerType === 'github_issue' ||
                    triggerType === 'gitlab_issue' ||
                    triggerType === 'gitlab_mr' ||
                    triggerType === 'forgejo_issue') && (
                    <>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Branch filter
                        </label>
                        <Input
                          value={branchFilter}
                          onChange={(e) => setBranchFilter(e.target.value)}
                          placeholder="e.g. feature/* or main"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-medium text-muted-foreground">
                          Label filter
                        </label>
                        <Input
                          value={labelFilter}
                          onChange={(e) => setLabelFilter(e.target.value)}
                          placeholder="bug, enhancement"
                          className="h-8 text-xs"
                        />
                      </div>
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Schedule (only in schedule mode) */}
          {mode === 'schedule' && (
            <Popover>
              <PopoverTrigger className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted/60">
                <Clock className="h-3 w-3" />
                <span className="max-w-[140px] truncate">{schedulePreview}</span>
              </PopoverTrigger>
              <PopoverContent className="w-auto min-w-[280px] p-3" align="start">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-7 w-[110px] items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted/60">
                        <span className="truncate">
                          {SCHEDULE_TYPES.find((s) => s.value === scheduleType)?.label}
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="min-w-[110px]">
                        {SCHEDULE_TYPES.map((s) => (
                          <DropdownMenuItem
                            key={s.value}
                            onClick={() => setScheduleType(s.value as ScheduleType)}
                            className="text-xs"
                          >
                            <span className="flex-1">{s.label}</span>
                            {scheduleType === s.value && (
                              <Check className="h-3 w-3 text-muted-foreground" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {scheduleType === 'weekly' && (
                      <>
                        <span className="text-[10px] text-muted-foreground">on</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-7 w-[100px] items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted/60">
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
                      </>
                    )}

                    {scheduleType === 'monthly' && (
                      <>
                        <span className="text-[10px] text-muted-foreground">on the</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-7 w-[70px] items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted/60">
                            <span className="truncate">
                              {DAYS_OF_MONTH.find((d) => d.value === dayOfMonth)?.label}
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="max-h-[240px] min-w-[80px] overflow-y-auto">
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
                      </>
                    )}

                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {scheduleType === 'hourly' ? 'at minute' : 'at'}
                    </span>

                    {scheduleType !== 'hourly' && (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-7 w-[64px] shrink-0 items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted/60">
                            <span className="truncate">
                              {HOURS.find((h) => h.value === hour)?.label}
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="max-h-[240px] min-w-[72px] overflow-y-auto">
                            {HOURS.map((h) => (
                              <DropdownMenuItem
                                key={h.value}
                                onClick={() => setHour(h.value)}
                                className="text-xs"
                              >
                                <span className="flex-1">{h.label}</span>
                                {hour === h.value && (
                                  <Check className="h-3 w-3 text-muted-foreground" />
                                )}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <span className="shrink-0 text-[10px] text-muted-foreground">:</span>
                      </>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-7 w-[64px] shrink-0 items-center justify-between rounded-md border border-border bg-background px-2.5 text-xs hover:bg-muted/60">
                        <span className="truncate">
                          {MINUTES.find((m) => m.value === minute)?.label}
                        </span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="max-h-[240px] min-w-[72px] overflow-y-auto">
                        {MINUTES.map((m) => (
                          <DropdownMenuItem
                            key={m.value}
                            onClick={() => setMinute(m.value)}
                            className="text-xs"
                          >
                            <span className="flex-1">{m.label}</span>
                            {minute === m.value && (
                              <Check className="h-3 w-3 text-muted-foreground" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Action row */}
        <div className="flex items-center justify-end gap-1.5 px-3 pb-2 pt-1">
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
  );
};

export default AutomationInlineCreate;
