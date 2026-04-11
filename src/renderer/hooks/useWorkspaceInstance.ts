import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  workspaceProvisionCompleteChannel,
  workspaceProvisionProgressChannel,
} from '@shared/events/workspaceProviderEvents';
import { events, rpc } from '../core/ipc';
import { appendProvisionLog } from '../lib/provision-log-cache';

export type WorkspaceInstanceStatus = 'provisioning' | 'ready' | 'terminated' | 'error';

export interface WorkspaceInstance {
  id: string;
  taskId: string;
  externalId: string | null;
  host: string;
  port: number;
  username: string | null;
  worktreePath: string | null;
  status: WorkspaceInstanceStatus;
  connectionId: string | null;
  createdAt: string;
  terminatedAt: string | null;
}

export function useWorkspaceInstance(taskId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['workspaceInstance', taskId] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => (taskId ? rpc.workspaceProvider.getStatus(taskId) : null),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll while provisioning
      if (data && typeof data === 'object' && 'status' in data && data.status === 'provisioning') {
        return 2000;
      }
      return false;
    },
  });

  // Listen for provision progress and completion events
  useEffect(() => {
    if (!taskId) return;

    const unsubProgress = events.on(workspaceProvisionProgressChannel, (data) => {
      appendProvisionLog(data.instanceId, data.line);
    });

    const unsubComplete = events.on(workspaceProvisionCompleteChannel, () => {
      void queryClient.invalidateQueries({ queryKey });
    });

    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, [taskId, queryClient, queryKey]);

  return {
    instance: query.data as WorkspaceInstance | null | undefined,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
