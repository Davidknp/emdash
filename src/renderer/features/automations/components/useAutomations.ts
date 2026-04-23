import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import type {
  Automation,
  AutomationRunLog,
  CreateAutomationInput,
  UpdateAutomationInput,
} from '@shared/automations/types';
import type { Result } from '@shared/result';
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

async function unwrap<T>(result: Result<T, string>, fallback: string): Promise<T> {
  if (!result.success) throw new Error(result.error ?? fallback);
  return result.data;
}

type ToastFn = ReturnType<typeof useToast>['toast'];

function buildMutation<TVars, TData>(
  queryClient: QueryClient,
  toast: ToastFn,
  opts: {
    run: (vars: TVars) => Promise<Result<TData, string>>;
    errorLabel: string;
    successToast?: string;
    onSuccess?: (data: TData, vars: TVars) => void;
  }
): UseMutationOptions<TData, Error, TVars> {
  return {
    mutationFn: async (vars) => unwrap(await opts.run(vars), `${opts.errorLabel} failed`),
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      opts.onSuccess?.(data, vars);
      if (opts.successToast) toast({ title: opts.successToast });
    },
    onError: (e) => {
      toast({
        title: `${opts.errorLabel} failed`,
        description: e.message,
        variant: 'destructive',
      });
    },
  };
}

export function useAutomations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    return onAnyRunEnded((automationId) => {
      queryClient.invalidateQueries({ queryKey: LIST_KEY });
      queryClient.invalidateQueries({ queryKey: runLogsKey(automationId) });
    });
  }, [queryClient]);

  const {
    data: automations = [],
    isPending: isLoading,
    refetch,
  } = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => unwrap(await rpc.automations.list(), 'Failed to load automations'),
    refetchInterval: 15_000,
  });

  const createMutation = useMutation(
    buildMutation<CreateAutomationInput, Automation>(queryClient, toast, {
      run: (input) => rpc.automations.create(input),
      errorLabel: 'Create',
    })
  );

  const updateMutation = useMutation(
    buildMutation<UpdateAutomationInput, unknown>(queryClient, toast, {
      run: (input) => rpc.automations.update(input),
      errorLabel: 'Update',
    })
  );

  const deleteMutation = useMutation(
    buildMutation<string, unknown>(queryClient, toast, {
      run: (id) => rpc.automations.delete({ id }),
      errorLabel: 'Delete',
      successToast: 'Automation deleted',
    })
  );

  const toggleMutation = useMutation(
    buildMutation<string, unknown>(queryClient, toast, {
      run: (id) => rpc.automations.toggle({ id }),
      errorLabel: 'Toggle',
    })
  );

  const triggerNowMutation = useMutation(
    buildMutation<string, unknown>(queryClient, toast, {
      run: (id) => rpc.automations.triggerNow({ id }),
      errorLabel: 'Trigger',
      successToast: 'Automation triggered',
    })
  );

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
      return unwrap(
        await rpc.automations.runLogs({ automationId, limit }),
        'Failed to load run logs'
      );
    },
    enabled: !!automationId,
    refetchInterval: 30_000,
  });
}

export function useIsAutomationRunning(automationId: string): boolean {
  return useSyncExternalStore(
    subscribeRunning,
    () => isAutomationRunning(automationId),
    () => false
  );
}

export function useAutomationMemory(automationId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const memoryKey = ['automations', 'memory', automationId] as const;

  const query = useQuery({
    queryKey: memoryKey,
    queryFn: async () =>
      unwrap(await rpc.automations.getMemory({ id: automationId }), 'Failed to load memory'),
  });

  const saveMutation = useMutation({
    mutationFn: async (content: string) =>
      unwrap(
        await rpc.automations.setMemory({ id: automationId, content }),
        'Failed to save memory'
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(memoryKey, data);
      toast({ title: 'Memory saved' });
    },
    onError: (e) => {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    },
  });

  const clearMutation = useMutation({
    mutationFn: async () =>
      unwrap(await rpc.automations.clearMemory({ id: automationId }), 'Failed to clear memory'),
    onSuccess: (data) => {
      queryClient.setQueryData(memoryKey, data);
      toast({ title: 'Memory cleared' });
    },
    onError: (e) => {
      toast({ title: 'Clear failed', description: e.message, variant: 'destructive' });
    },
  });

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    save: (content: string) => saveMutation.mutateAsync(content),
    clear: () => clearMutation.mutateAsync(),
    isSaving: saveMutation.isPending,
    isClearing: clearMutation.isPending,
  };
}

export function useRunningAutomationCount(): number {
  return useSyncExternalStore(
    subscribeRunning,
    () => getRunningSnapshot().size,
    () => 0
  );
}
