import { useQuery } from '@tanstack/react-query';
import { rpc } from '@renderer/lib/ipc';

export function useWorkspaceInstance(taskId: string | undefined) {
  return useQuery({
    queryKey: ['workspace-instance', taskId],
    queryFn: () => rpc.workspaceProvider.getInstance(taskId!),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll while provisioning or terminating
      if (status === 'provisioning' || status === 'terminating') {
        return 2000;
      }
      return false;
    },
  });
}
