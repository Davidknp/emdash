import { createRPCController } from '@shared/ipc/rpc';
import type { TelemetryEvent } from '@shared/telemetry';
import rawAppConfig from '@main/appConfig.json';
import {
  capture,
  getTelemetryStatus,
  identify,
  isTelemetryEnabled,
  setTelemetryEnabledViaUser,
} from '@main/lib/telemetry';

const appConfig: { posthogHost?: string; posthogKey?: string } = rawAppConfig;

export const telemetryController = createRPCController({
  capture: (args: { event: TelemetryEvent; properties?: Record<string, unknown> }) => {
    capture(args.event, args.properties);
  },
  getStatus: () => {
    return { status: getTelemetryStatus() };
  },
  getPostHogConfig: () => {
    if (!isTelemetryEnabled()) return { key: null, host: null };
    return { key: appConfig.posthogKey ?? null, host: appConfig.posthogHost ?? null };
  },
  setEnabled: (enabled: boolean) => {
    setTelemetryEnabledViaUser(enabled);
  },
  identify: (username: string) => {
    identify(username);
  },
});
