import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import { useEffect, useState, type ReactNode } from 'react';
import { rpc } from '@renderer/lib/ipc';

export function PostHogFeatureFlagProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized) return;

    void (async () => {
      try {
        const { key, host } = await rpc.telemetry.getPostHogConfig();
        if (!key || !host) return;

        posthog.init(key, {
          api_host: host,
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
    })();
  }, [initialized]);

  // Respect telemetry opt-out changes
  useEffect(() => {
    if (!initialized) return;

    const checkOptOut = async () => {
      try {
        const { status } = await rpc.telemetry.getStatus();
        if (!status.enabled) {
          posthog.opt_out_capturing();
        } else {
          posthog.opt_in_capturing();
        }
      } catch {
        // Ignore
      }
    };

    void checkOptOut();
  }, [initialized]);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>;
}
