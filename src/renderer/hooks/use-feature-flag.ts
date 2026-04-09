import posthog from 'posthog-js';
import { useEffect, useState } from 'react';

/**
 * Returns true only when the named PostHog feature flag is explicitly enabled.
 * Re-renders whenever PostHog reloads its flag set (so remote toggles take effect
 * without a page refresh).
 */
export function useFeatureFlag(flag: string): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => posthog.isFeatureEnabled(flag) === true);

  useEffect(() => {
    setEnabled(posthog.isFeatureEnabled(flag) === true);
    return posthog.onFeatureFlags(() => {
      setEnabled(posthog.isFeatureEnabled(flag) === true);
    });
  }, [flag]);

  return enabled;
}
