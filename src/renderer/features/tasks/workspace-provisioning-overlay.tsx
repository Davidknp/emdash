import { AlertCircle, Loader2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  workspaceProvisionProgressChannel,
  workspaceProvisionTimeoutWarningChannel,
} from '@shared/events/workspaceProviderEvents';
import type { WorkspaceInstance } from '@shared/tasks';
import { events, rpc } from '@renderer/lib/ipc';

export function WorkspaceProvisioningOverlay({
  taskId,
  instance,
  taskError,
}: {
  taskId: string;
  instance: WorkspaceInstance;
  taskError?: string;
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to stderr progress events
  useEffect(() => {
    const unsub = events.on(
      workspaceProvisionProgressChannel,
      (data) => {
        setLines((prev) => {
          const next = [...prev, data.line];
          return next.length > 200 ? next.slice(-200) : next;
        });
      },
      taskId
    );
    return unsub;
  }, [taskId]);

  // Subscribe to timeout warning
  useEffect(() => {
    const unsub = events.on(
      workspaceProvisionTimeoutWarningChannel,
      () => setTimeoutWarning(true),
      taskId
    );
    return unsub;
  }, [taskId]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const handleCancel = useCallback(() => {
    void rpc.workspaceProvider.cancelProvision(taskId);
  }, [taskId]);

  const handleRetry = useCallback(() => {
    setLines([]);
    setTimeoutWarning(false);
    void rpc.workspaceProvider.retryProvision(taskId);
  }, [taskId]);

  const isProvisioning = instance.status === 'provisioning';
  const isReady = instance.status === 'ready';
  const isError = instance.status === 'error' || !!taskError;
  const errorMessage = taskError ?? instance.errorMessage;

  return (
    <div className="flex flex-col gap-3 p-4 h-full">
      <div className="flex items-center gap-2">
        {isProvisioning && (
          <>
            <Loader2 className="size-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium">Provisioning workspace...</span>
          </>
        )}
        {isReady && !isError && (
          <>
            <Loader2 className="size-4 animate-spin text-blue-500" />
            <span className="text-sm font-medium">Connecting to workspace...</span>
          </>
        )}
        {isError && (
          <>
            <AlertCircle className="size-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {taskError ? 'Failed to connect to workspace' : 'Provisioning failed'}
            </span>
          </>
        )}
      </div>

      {timeoutWarning && isProvisioning && (
        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-400">
          Provisioning is taking longer than expected (over 5 minutes).
        </div>
      )}

      {isError && errorMessage && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
          {errorMessage}
        </div>
      )}

      {/* Stderr log */}
      <div className="flex-1 min-h-0 overflow-auto rounded-md bg-muted/50 border border-border p-2 font-mono text-xs">
        {lines.length === 0 && instance.stderrLog ? (
          instance.stderrLog.split('\n').map((line, i) => (
            <div key={i} className="text-muted-foreground whitespace-pre-wrap">
              {line}
            </div>
          ))
        ) : lines.length === 0 ? (
          <div className="text-muted-foreground">Waiting for provisioner output...</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="text-muted-foreground whitespace-pre-wrap">
              {line}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isProvisioning && (
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors"
          >
            <X className="size-3" />
            Cancel
          </button>
        )}
        {isError && (
          <button
            onClick={handleRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className="size-3" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
