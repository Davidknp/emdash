import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type {
  Automation,
  AutomationRunLog,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@shared/automations/types';
import { rpc } from '@renderer/core/ipc';

const AUTOMATIONS_KEY = ['automations', 'list'] as const;
const REFRESH_INTERVAL = 30_000;

function unwrap<T>(result: { success: boolean; data?: T; error?: string }, fallback: string): T {
  if (result.success && result.data !== undefined) return result.data;
  throw new Error(result.error ?? fallback);
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function useAutomations() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery<Automation[]>({
    queryKey: AUTOMATIONS_KEY,
    queryFn: async () => unwrap(await rpc.automations.list(), 'Failed to load automations'),
    refetchInterval: REFRESH_INTERVAL,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: AUTOMATIONS_KEY }),
    [queryClient]
  );

  const createMutation = useMutation({
    mutationFn: async (input: CreateAutomationInput) =>
      unwrap(await rpc.automations.create(input), 'Failed to create automation'),
    onSuccess: () => invalidate(),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: UpdateAutomationInput) =>
      unwrap(await rpc.automations.update(input), 'Failed to update automation'),
    onSuccess: () => invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await rpc.automations.delete(id), 'Failed to delete automation'),
    onSuccess: () => invalidate(),
  });

  const toggleMutation = useMutation({
    mutationFn: async (id: string) =>
      unwrap(await rpc.automations.toggle(id), 'Failed to toggle automation'),
    onSuccess: () => invalidate(),
  });

  const triggerNowMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await rpc.automations.triggerNow(id);
      if (!result.success) throw new Error(result.error ?? 'Failed to trigger automation');
    },
    onSuccess: () => invalidate(),
  });

  const create = useCallback(
    async (input: CreateAutomationInput): Promise<Automation | null> => {
      try {
        return await createMutation.mutateAsync(input);
      } catch (err) {
        setError(messageOf(err, 'Failed to create automation'));
        return null;
      }
    },
    [createMutation]
  );

  const update = useCallback(
    async (input: UpdateAutomationInput): Promise<Automation | null> => {
      try {
        return await updateMutation.mutateAsync(input);
      } catch (err) {
        setError(messageOf(err, 'Failed to update automation'));
        return null;
      }
    },
    [updateMutation]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await deleteMutation.mutateAsync(id);
        return true;
      } catch (err) {
        setError(messageOf(err, 'Failed to delete automation'));
        return false;
      }
    },
    [deleteMutation]
  );

  const toggle = useCallback(
    async (id: string): Promise<Automation | null> => {
      try {
        return await toggleMutation.mutateAsync(id);
      } catch (err) {
        setError(messageOf(err, 'Failed to toggle automation'));
        return null;
      }
    },
    [toggleMutation]
  );

  const triggerNow = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        await triggerNowMutation.mutateAsync(id);
        return true;
      } catch (err) {
        console.error('Failed to trigger automation:', err);
        return false;
      }
    },
    [triggerNowMutation]
  );

  const getRunLogs = useCallback(
    async (automationId: string, limit?: number): Promise<AutomationRunLog[]> => {
      try {
        const result = await rpc.automations.runLogs(automationId, limit);
        return result.success && result.data ? result.data : [];
      } catch (err) {
        console.error('Failed to fetch run logs:', err);
        return [];
      }
    },
    []
  );

  const queryError = query.error instanceof Error ? query.error.message : null;

  return {
    automations: query.data ?? [],
    isLoading: query.isLoading,
    error: error ?? queryError,
    clearError: useCallback(() => setError(null), []),
    refresh: invalidate,
    create,
    update,
    remove,
    toggle,
    getRunLogs,
    triggerNow,
  };
}
