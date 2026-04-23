import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, Loader2, Timer, XCircle, type LucideIcon } from 'lucide-react';
import React from 'react';
import type { AutomationRunLog } from '@shared/automations/types';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/lib/ui/dialog';
import { ScrollArea } from '@renderer/lib/ui/scroll-area';
import { cn } from '@renderer/utils/utils';
import { useRunLogs } from './useAutomations';
import { formatDateTime, formatRelative } from './utils';

type Props = {
  automationId: string;
  automationName: string;
} & BaseModalProps<void>;

type StatusConfig = {
  Icon: LucideIcon;
  iconClass: string;
  bgClass: string;
  label: string;
};

function statusConfig(status: AutomationRunLog['status']): StatusConfig {
  switch (status) {
    case 'success':
      return {
        Icon: CheckCircle2,
        iconClass: 'text-emerald-500',
        bgClass: 'bg-emerald-500/[0.08] border-emerald-500/20',
        label: 'Success',
      };
    case 'failure':
      return {
        Icon: XCircle,
        iconClass: 'text-destructive',
        bgClass: 'bg-destructive/[0.08] border-destructive/20',
        label: 'Failed',
      };
    case 'running':
      return {
        Icon: Loader2,
        iconClass: 'text-blue-500 animate-spin',
        bgClass: 'bg-blue-500/[0.08] border-blue-500/20',
        label: 'Running',
      };
  }
}

function durationLabel(log: AutomationRunLog): string {
  if (!log.finishedAt) return '—';
  const ms = new Date(log.finishedAt).getTime() - new Date(log.startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function LogRowSkeleton() {
  return (
    <div className="rounded-md border border-border/40 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 h-6 w-6 shrink-0 animate-pulse rounded-full bg-muted/50" />
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="h-3 w-16 animate-pulse rounded bg-muted/50" />
            <div className="h-3 w-10 animate-pulse rounded bg-muted/40" />
          </div>
          <div className="h-3 w-24 animate-pulse rounded bg-muted/40" />
        </div>
      </div>
    </div>
  );
}

export const RunLogsModal: React.FC<Props> = ({ automationId, automationName, onClose }) => {
  const { data: logs = [], isPending } = useRunLogs(automationId);
  const shouldReduceMotion = useReducedMotion();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{automationName}</DialogTitle>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            <span className="tabular-nums">{logs.length}</span> {logs.length === 1 ? 'run' : 'runs'}{' '}
            total
          </p>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          {isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <LogRowSkeleton key={i} />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Timer className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No runs yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log, i) => {
                const { Icon, iconClass, bgClass, label } = statusConfig(log.status);
                return (
                  <motion.div
                    key={log.id}
                    className={cn('rounded-md border px-3 py-2.5 text-xs', bgClass)}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: shouldReduceMotion ? 0 : 0.2,
                      delay: shouldReduceMotion ? 0 : Math.min(i * 0.04, 0.32),
                      ease: [0.23, 1, 0.32, 1],
                    }}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className={cn(
                          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background/40'
                        )}
                      >
                        <Icon className={cn('h-3.5 w-3.5', iconClass)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{label}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {durationLabel(log)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-muted-foreground">
                          <span title={formatDateTime(log.startedAt)}>
                            {formatRelative(log.startedAt)}
                          </span>
                        </div>
                        {log.error && (
                          <p className="mt-1.5 break-words text-destructive/90">{log.error}</p>
                        )}
                        {log.taskId && (
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">
                            {log.taskId}
                          </p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
