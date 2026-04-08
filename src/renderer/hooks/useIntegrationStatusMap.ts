import { useQuery } from '@tanstack/react-query';
import type { IntegrationStatusMap } from '@shared/integrations/types';
import { rpc } from '@renderer/core/ipc';

const EMPTY: IntegrationStatusMap = {
  github: false,
  linear: false,
  jira: false,
  gitlab: false,
  plain: false,
  forgejo: false,
  sentry: false,
};

export function useIntegrationStatusMap() {
  const query = useQuery({
    queryKey: ['integrations', 'status-map'],
    queryFn: () => rpc.integrations.statusMap(),
    staleTime: 30_000,
  });

  return {
    statuses: query.data ?? EMPTY,
    isLoading: query.isLoading,
    error: query.error,
  };
}
