import { createRPCController } from '@shared/ipc/rpc';
import rawAppConfig from '@main/appConfig.json';
import * as telemetry from '@main/lib/telemetry';

const appConfig: { posthogHost?: string; posthogKey?: string } = rawAppConfig;

export const telemetryController = createRPCController({
  getStatus: () => {
    const status = telemetry.getTelemetryStatus();
    return {
      ...status,
      posthogKey: appConfig.posthogKey,
      posthogHost: appConfig.posthogHost,
    };
  },

  setEnabled: async (enabled: boolean) => {
    telemetry.setTelemetryEnabledViaUser(enabled);
    const status = telemetry.getTelemetryStatus();
    return {
      ...status,
      posthogKey: appConfig.posthogKey,
      posthogHost: appConfig.posthogHost,
    };
  },

  capture: async (params: { event: string; properties?: Record<string, unknown> }) => {
    telemetry.capture(params.event as Parameters<typeof telemetry.capture>[0], params.properties);
  },

  isFeatureEnabled: (flag: string) => {
    // Environment variable override for local dev/QA
    const envKey = `EMDASH_FEATURE_${flag.toUpperCase().replace(/-/g, '_')}`;
    return process.env[envKey] === '1' || process.env[envKey] === 'true';
  },
});
