import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect, useState, type ReactNode } from 'react';
import { useAccountSession } from '../hooks/useAccount';
import { useTelemetryConsent } from '../hooks/useTelemetryConsent';

export function PostHogFeatureFlagProvider({ children }: { children: ReactNode }) {
  const {
    prefEnabled: telemetryEnabled,
    loading: telemetryLoading,
    hasKeyAndHost,
    posthogKey,
    posthogHost,
  } = useTelemetryConsent();
  const { data: session } = useAccountSession();
  const [initialized, setInitialized] = useState(false);

  // Initialize posthog-js once when telemetry is confirmed enabled.
  useEffect(() => {
    if (telemetryLoading || initialized) return;
    if (!telemetryEnabled || !hasKeyAndHost) return;
    if (!posthogKey || !posthogHost) return;

    try {
      posthog.init(posthogKey, {
        api_host: posthogHost,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        persistence: 'localStorage',
      });
      setInitialized(true);
    } catch {
      // Telemetry must never crash the app
    }
  }, [telemetryEnabled, telemetryLoading, hasKeyAndHost, initialized, posthogKey, posthogHost]);

  // Respect mid-session telemetry opt-out
  useEffect(() => {
    if (!initialized) return;
    if (!telemetryEnabled) {
      posthog.opt_out_capturing();
    } else {
      posthog.opt_in_capturing();
    }
  }, [initialized, telemetryEnabled]);

  // Identify / reset when account state changes
  useEffect(() => {
    if (!initialized) return;

    if (session?.isSignedIn && session.user) {
      posthog.identify(session.user.username, { email: session.user.email });
    } else {
      posthog.reset();
    }
  }, [initialized, session?.isSignedIn, session?.user]);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
