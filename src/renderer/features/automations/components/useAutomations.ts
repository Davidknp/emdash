import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import type {
  Automation,
  AutomationRunLog,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@shared/automations/types';
import { useToast } from '@renderer/lib/hooks/use-toast';
import { rpc } from '@renderer/lib/ipc';
import {
  getRunningSnapshot,
  isAutomationRunning,
  onAnyRunEnded,
  subscribe as subscribeRunning,
} from './runningAutomationsStore';

const LIST_KEY = ['automations', 'list'] as const;
const runLogsKey = (id: string) => ['automations', 'run-logs', id] as const;

export function useAutomations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    return onAnyRunEnded((automationId) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: ['automations', 'run-logs', automationId] });
    });
  }, [queryClient]);

  const {
    data: automations = [],
    isPending: isLoading,
    refetch,
  } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const res = await rpc.automations.list();
      if (!res.success) throw new Error(res.error ?? 'Failed to load automations');
      return res.data;
    },
    refetchInterval: 15_000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateAutomationInput) => {
      const res = await rpc.automations.create(input);
      if (!res.success) throw new Error(res.error ?? 'Failed to create automation');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      toast({ title: 'Automation created' });
    },
    onError: (e) => {
      toast({ title: 'Create failed', description: e.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateAutomationInput) => {
      const res = await rpc.automations.update(input);
      if (!res.success) throw new Error(res.error ?? 'Failed to update automation');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (e) => {
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await rpc.automations.delete({ id });
      if (!res.success) throw new Error(res.error ?? 'Failed to delete automation');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      toast({ title: 'Automation deleted' });
    },
    onError: (e) => {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await rpc.automations.toggle({ id });
      if (!res.success) throw new Error(res.error ?? 'Failed to toggle automation');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (e) => {
      toast({ title: 'Toggle failed', description: e.message, variant: 'destructive' });
    },
  });

  const triggerNowMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await rpc.automations.triggerNow({ id });
      if (!res.success) throw new Error(res.error ?? 'Failed to trigger automation');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      toast({ title: 'Automation triggered' });
    },
    onError: (e) => {
      toast({ title: 'Trigger failed', description: e.message, variant: 'destructive' });
    },
  });

  return {
    automations,
    isLoading,
    refetch,
    createAutomation: (input: CreateAutomationInput) => createMutation.mutateAsync(input),
    updateAutomation: (input: UpdateAutomationInput) => updateMutation.mutateAsync(input),
    deleteAutomation: (id: string) => deleteMutation.mutateAsync(id),
    toggleAutomation: (id: string) => toggleMutation.mutateAsync(id),
    triggerNow: (id: string) => triggerNowMutation.mutateAsync(id),
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  };
}

export function useRunLogs(automationId: string | null, limit = 20) {
  return useQuery<AutomationRunLog[]>({
    queryKey: automationId ? runLogsKey(automationId) : ['automations', 'run-logs', 'none'],
    queryFn: async () => {
      if (!automationId) return [];
      const res = await rpc.automations.runLogs({ automationId, limit });
      if (!res.success) throw new Error(res.error ?? 'Failed to load run logs');
      return res.data;
    },
    enabled: !!automationId,
    refetchInterval: 5_000,
  });
}

export function useIsAutomationRunning(automationId: string): boolean {
  return useSyncExternalStore(
    subscribeRunning,
    () => isAutomationRunning(automationId),
    () => false
  );
}

export function useRunningAutomationCount(): number {
  return useSyncExternalStore(
    subscribeRunning,
    () => getRunningSnapshot().size,
    () => 0
  );
}

export type { Automation };
