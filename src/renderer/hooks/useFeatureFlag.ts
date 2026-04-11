import { useQuery } from '@tanstack/react-query';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { rpc } from '../core/ipc';

/**
 * Returns `true` when a feature flag is enabled.
 *
 * Checks PostHog first (for gradual rollout), then falls back to a
 * main-process env var override (EMDASH_FEATURE_<FLAG>=1) for local dev/QA.
 */
export function useFeatureFlag(flag: string): boolean {
  const posthogEnabled = useFeatureFlagEnabled(flag);

  // Env var fallback for local dev without PostHog access
  const { data: envOverride } = useQuery({
    queryKey: ['featureFlag', 'envOverride', flag],
    queryFn: () => rpc.telemetry.isFeatureEnabled(flag),
    staleTime: Infinity,
  });

  return posthogEnabled === true || envOverride === true;
}
