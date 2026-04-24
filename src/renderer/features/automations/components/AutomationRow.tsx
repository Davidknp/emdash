import { Clock, History, Pause, Play, Trash2, Zap } from 'lucide-react';
import React from 'react';
import type { Automation } from '@shared/automations/types';
import { Button } from '@renderer/lib/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { cn } from '@renderer/utils/utils';
import { TriggerTypeIcon } from './trigger-controls';
import { describeScheduleShort, describeTrigger } from './utils';

type Props = {
  automation: Automation;
  onToggle: () => void;
  onDelete: () => void;
  onTriggerNow: () => void;
  onShowLogs: () => void;
  onEdit: () => void;
  busy?: boolean;
};

function StatusLabel({ automation }: { automation: Automation }) {
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
  const cadence =
    automation.mode === 'schedule'
      ? describeScheduleShort(automation.schedule)
      : describeTrigger(automation.triggerType);
  const projectLabel = automation.projectName || automation.projectId;

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(e) => {
        if (e.currentTarget !== e.target) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        'group cursor-pointer rounded-lg bg-muted/20 px-3 py-2.5 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.04)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.06),0_1px_2px_rgb(0_0_0/0.3)] hover:bg-muted/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [transition-property:background-color,opacity,box-shadow,transform] [transition-duration:150ms,150ms,150ms,120ms] [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]',
        isPaused && !busy && 'opacity-60'
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-muted/60 text-muted-foreground">
          {automation.mode === 'trigger' && automation.triggerType ? (
            <TriggerTypeIcon triggerType={automation.triggerType} className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-sm font-medium truncate">{automation.name}</h3>
            <span className="shrink-0 text-xs">
              <StatusLabel automation={automation} />
            </span>
          </div>
          <div className="mt-0.5 min-w-0 truncate text-xs text-muted-foreground/80">
            {projectLabel}
          </div>
          {automation.lastRunError && (
            <p className="mt-1 text-xs text-destructive/80 truncate">{automation.lastRunError}</p>
          )}
        </div>

        <div className="relative shrink-0 flex items-center">
          <span
            className="text-xs text-muted-foreground/80 whitespace-nowrap transition-opacity duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:opacity-0 group-focus-within:opacity-0"
            aria-hidden="true"
          >
            {cadence}
          </span>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 translate-x-1 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 group-focus-within:translate-x-0">
            {automation.mode === 'schedule' && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={(e) => {
                        stop(e);
                        onTriggerNow();
                      }}
                      disabled={busy}
                      aria-label="Run now"
                    >
                      <Zap className="h-4 w-4" />
                    </Button>
                  }
                />
                <TooltipContent>Run now</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      stop(e);
                      onToggle();
                    }}
                    disabled={busy}
                    aria-label={isPaused ? 'Resume' : 'Pause'}
                  >
                    {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  </Button>
                }
              />
              <TooltipContent>{isPaused ? 'Resume' : 'Pause'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      stop(e);
                      onShowLogs();
                    }}
                    aria-label="View run logs"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                }
              />
              <TooltipContent>Run logs</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={(e) => {
                      stop(e);
                      onDelete();
                    }}
                    disabled={busy}
                    aria-label="Delete"
                    className="text-muted-foreground hover:!bg-destructive/10 hover:!text-destructive dark:hover:!bg-destructive/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
};
