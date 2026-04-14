import { useFeatureFlagEnabled } from 'posthog-js/react';
import { useEffect, useState } from 'react';
import { rpc } from '@renderer/lib/ipc';

export function useFeatureFlag(flag: string): boolean {
  const posthogEnabled = useFeatureFlagEnabled(flag) === true;
  const [envOverride, setEnvOverride] = useState(false);

  useEffect(() => {
    if (flag === 'workspace-provider') {
      rpc.workspaceProvider
        .isFeatureEnabled()
        .then(setEnvOverride)
        .catch(() => {});
    }
  }, [flag]);

  return posthogEnabled || envOverride;
}
