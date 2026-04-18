import {
  Clock,
  History,
  Loader2,
  MessageSquare,
  Pause,
  Pencil,
  Play,
  Trash2,
  Zap,
} from 'lucide-react';
import React from 'react';
import type { Automation, TriggerType } from '@shared/automations/types';
import { ISSUE_PROVIDER_META } from '@renderer/features/integrations/issue-provider-meta';
import { Button } from '@renderer/lib/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { cn } from '@renderer/utils/utils';
import { useIsAutomationRunning } from './useAutomations';
import { describeSchedule, describeTrigger, formatRelative } from './utils';

type Props = {
  automation: Automation;
  onToggle: () => void;
  onDelete: () => void;
  onTriggerNow: () => void;
  onShowLogs: () => void;
  onEdit: () => void;
  busy?: boolean;
};

function TriggerIcon({ triggerType, className }: { triggerType: TriggerType; className?: string }) {
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
      return <MessageSquare className={className} />;
    default:
      return <Zap className={className} />;
  }
}

function StatusLabel({ automation, isRunning }: { automation: Automation; isRunning: boolean }) {
  if (isRunning) {
    return (
      <span className="inline-flex items-center gap-1 text-blue-500/90">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </span>
    );
  }
  if (automation.status === 'paused') {
    return <span className="text-muted-foreground/60">Paused</span>;
  }
  if (automation.status === 'error' || automation.lastRunResult === 'failure') {
    return <span className="text-destructive/80">Last run failed</span>;
  }
  return <span className="text-emerald-500/80">Active</span>;
}

export const AutomationRow: React.FC<Props> = ({
  automation,
  onToggle,
  onDelete,
  onTriggerNow,
  onShowLogs,
  onEdit,
  busy = false,
}) => {
  const isPaused = automation.status === 'paused';
  const isRunning = useIsAutomationRunning(automation.id);
  const cadence =
    automation.mode === 'schedule'
      ? describeSchedule(automation.schedule)
      : describeTrigger(automation.triggerType);

  return (
    <div
      className={cn(
        'group rounded-lg border border-border bg-muted/20 p-4 shadow-sm transition-all hover:bg-muted/40 hover:shadow-md',
        isPaused && !busy && !isRunning && 'opacity-60',
        isRunning && 'border-blue-500/30 bg-blue-500/[0.04]'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-medium truncate">{automation.name}</h3>
            <span className="shrink-0 text-xs">
              <StatusLabel automation={automation} isRunning={isRunning} />
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            <span className="truncate">{automation.projectName || automation.projectId}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{automation.agentId}</span>
          </div>
          <p className="mt-2 text-xs text-foreground-muted line-clamp-2 leading-relaxed">
            {automation.prompt}
          </p>
          <div className="mt-2.5 flex items-center gap-3 text-xs text-muted-foreground/80">
            <span className="inline-flex items-center gap-1.5">
              {automation.mode === 'trigger' && automation.triggerType ? (
                <TriggerIcon triggerType={automation.triggerType} className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {cadence}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <button
              type="button"
              onClick={onShowLogs}
              className="tabular-nums hover:text-foreground transition-colors"
            >
              {automation.runCount} {automation.runCount === 1 ? 'run' : 'runs'}
            </button>
            <span className="text-muted-foreground/40">·</span>
            <span className="tabular-nums">
              {automation.mode === 'schedule' && !isPaused
                ? `next ${formatRelative(automation.nextRunAt)}`
                : `last ${formatRelative(automation.lastRunAt)}`}
            </span>
          </div>
          {automation.lastRunError && (
            <p className="mt-2 text-xs text-destructive/80 truncate">{automation.lastRunError}</p>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {automation.mode === 'schedule' && (
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onTriggerNow}
                  disabled={busy}
                  aria-label="Run now"
                >
                  <Zap className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run now</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggle}
                disabled={busy}
                aria-label={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPaused ? 'Resume' : 'Pause'}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onShowLogs}
                aria-label="View run logs"
              >
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Run logs</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onEdit}
                disabled={busy}
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                disabled={busy}
                aria-label="Delete"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
