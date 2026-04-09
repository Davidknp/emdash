import { createRPCController } from '@shared/ipc/rpc';
import {
  capture as captureTelemetryEvent,
  getTelemetryClientConfig,
  getTelemetryStatus,
  setTelemetryEnabledViaUser,
} from '@main/lib/telemetry';

export const telemetryController = createRPCController({
  capture: async ({
    event,
    properties,
  }: {
    event: string;
    properties?: Record<string, unknown>;
  }) => {
    captureTelemetryEvent(event as Parameters<typeof captureTelemetryEvent>[0], properties);
  },

  getStatus: async () => {
    return {
      status: getTelemetryStatus(),
      clientConfig: getTelemetryClientConfig(),
    };
  },

  setEnabled: async (enabled: boolean) => {
    setTelemetryEnabledViaUser(enabled);

    return {
      status: getTelemetryStatus(),
      clientConfig: getTelemetryClientConfig(),
    };
  },
});
