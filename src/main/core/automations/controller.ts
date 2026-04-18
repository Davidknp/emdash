import type { CreateAutomationInput, UpdateAutomationInput } from '@shared/automations/types';
import { createRPCController } from '@shared/ipc/rpc';
import { automationsService } from '@main/core/automations/AutomationsService';
import { log } from '@main/lib/logger';

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const automationsController = createRPCController({
  list: async () => {
    try {
      const data = await automationsService.list();
      return { success: true as const, data };
    } catch (error) {
      log.error('[Automations.list]', error);
      return { success: false as const, error: toMessage(error) };
    }
  },

  get: async (args: { id: string }) => {
    try {
      const data = await automationsService.get(args.id);
      return { success: true as const, data };
    } catch (error) {
      log.error('[Automations.get]', error);
      return { success: false as const, error: toMessage(error) };
    }
  },

  create: async (args: CreateAutomationInput) => {
    try {
      const data = await automationsService.create(args);
      return { success: true as const, data };
    } catch (error) {
      log.error('[Automations.create]', error);
      return { success: false as const, error: toMessage(error) };
    }
  },

  update: async (args: UpdateAutomationInput) => {
    try {
      const data = await automationsService.update(args);
      return { success: true as const, data };
    } catch (error) {
      log.error('[Automations.update]', error);
      return { success: false as const, error: toMessage(error) };
    }
  },

  delete: async (args: { id: string }) => {
    try {
      const data = await automationsService.delete(args.id);
      return { success: true as const, data };
    } catch (error) {
      log.error('[Automations.delete]', error);
      return { success: false as const, error: toMessage(error) };
    }
  },

  toggle: async (args: { id: string }) => {
    try {
      const data = await automationsService.toggleStatus(args.id);
      return { success: true as const, data };
    } catch (error) {
      log.error('[Automations.toggle]', error);
      return { success: false as const, error: toMessage(error) };
    }
  },

  triggerNow: async (args: { id: string }) => {
    try {
      const data = await automationsService.triggerNow(args.id);
      return { success: true as const, data };
    } catch (error) {
      log.error('[Automations.triggerNow]', error);
      return { success: false as const, error: toMessage(error) };
    }
  },

  runLogs: async (args: { automationId: string; limit?: number }) => {
    try {
      const data = await automationsService.getRunLogs(args.automationId, args.limit);
      return { success: true as const, data };
    } catch (error) {
      log.error('[Automations.runLogs]', error);
      return { success: false as const, error: toMessage(error) };
    }
  },
});
