import posthog from 'posthog-js';

type TelemetryBootstrapState = {
  status?: {
    enabled: boolean;
  };
  clientConfig?: {
    posthogKey: string;
    posthogHost: string;
  } | null;
};

let posthogInitialized = false;
let identifiedUser: string | null = null;

export function syncPosthogFeatureFlags(state: TelemetryBootstrapState | null | undefined): void {
  const clientConfig = state?.clientConfig;
  const shouldEnable = state?.status?.enabled === true && !!clientConfig;

  if (!shouldEnable || !clientConfig) {
    if (posthogInitialized) {
      posthog.reset();
      posthogInitialized = false;
      identifiedUser = null;
    }
    return;
  }

  if (!posthogInitialized) {
    posthog.init(clientConfig.posthogKey, {
      api_host: clientConfig.posthogHost,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      persistence: 'localStorage',
      loaded: (ph) => {
        ph.reloadFeatureFlags();
      },
    });
    posthogInitialized = true;
    return;
  }

  posthog.reloadFeatureFlags();
}

/**
 * Identify or reset the PostHog user when account state changes.
 * Calls `posthog.identify()` for signed-in users so user-targeted feature flags
 * resolve correctly, and `posthog.reset()` on sign-out.
 */
export function syncPosthogIdentity(
  user: { username: string; email: string } | null | undefined,
  isSignedIn: boolean
): void {
  if (!posthogInitialized) return;

  if (isSignedIn && user) {
    if (identifiedUser !== user.username) {
      posthog.identify(user.username, { email: user.email });
      posthog.reloadFeatureFlags();
      identifiedUser = user.username;
    }
  } else if (identifiedUser !== null) {
    posthog.reset();
    posthog.reloadFeatureFlags();
    identifiedUser = null;
  }
}
