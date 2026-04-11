import { AlertCircle, Loader2, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  workspaceProvisionProgressChannel,
  workspaceProvisionTimeoutWarningChannel,
} from '@shared/events/workspaceProviderEvents';
import { Button } from '@renderer/components/ui/button';
import { events, rpc } from '@renderer/core/ipc';

interface WorkspaceProvisioningOverlayProps {
  instanceId: string;
  status: 'provisioning' | 'error';
  onRetry: () => void;
  errorMessage?: string;
}

export function WorkspaceProvisioningOverlay({
  instanceId,
  status,
  onRetry,
  errorMessage,
}: WorkspaceProvisioningOverlayProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [timeoutWarning, setTimeoutWarning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stream stderr progress
  useEffect(() => {
    const unsub = events.on(workspaceProvisionProgressChannel, (data) => {
      if (data.instanceId !== instanceId) return;
      setLines((prev) => [...prev, data.line]);
    });
    return unsub;
  }, [instanceId]);

  // Timeout warning
  useEffect(() => {
    const unsub = events.on(workspaceProvisionTimeoutWarningChannel, (data) => {
      if (data.instanceId !== instanceId) return;
      setTimeoutWarning(true);
    });
    return unsub;
  }, [instanceId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleCancel = useCallback(async () => {
    await rpc.workspaceProvider.cancel(instanceId);
  }, [instanceId]);

  const isError = status === 'error';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <div className="flex w-full max-w-lg flex-col gap-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          {isError ? (
            <AlertCircle className="h-5 w-5 text-foreground-destructive" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
          )}
          <span className="text-sm font-medium">
            {isError ? 'Workspace provisioning failed' : 'Provisioning remote workspace...'}
          </span>
        </div>

        {/* Timeout warning */}
        {timeoutWarning && !isError && (
          <div className="rounded border border-border bg-background-1 px-3 py-2 text-xs text-foreground-muted">
            Provisioning is taking longer than expected. The process is still running.
          </div>
        )}

        {/* Error message */}
        {isError && errorMessage && (
          <div className="rounded border border-border-destructive bg-background-destructive px-3 py-2 text-xs text-foreground-destructive">
            {errorMessage}
          </div>
        )}

        {/* Log output */}
        <div
          ref={scrollRef}
          className="h-48 overflow-y-auto rounded border border-border bg-background-1 p-2 font-mono text-xs text-foreground-muted"
        >
          {lines.length === 0 ? (
            <span className="text-foreground-passive">Waiting for output...</span>
          ) : (
            lines.map((line, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {isError && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          )}
          {!isError && (
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
