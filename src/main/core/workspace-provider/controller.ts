import { createRPCController } from '@shared/ipc/rpc';
import {
  cancel,
  getActiveInstance,
  getInstance,
  provision,
  terminate,
  type ProvisionParams,
  type TerminateParams,
} from './workspace-provider-service';

export const workspaceProviderController = createRPCController({
  provision: async (params: ProvisionParams) => {
    return provision(params);
  },

  cancel: async (instanceId: string) => {
    await cancel(instanceId);
  },

  terminate: async (params: TerminateParams) => {
    await terminate(params);
  },

  getStatus: async (taskId: string) => {
    return getActiveInstance(taskId);
  },

  getInstance: async (instanceId: string) => {
    return getInstance(instanceId);
  },
});
