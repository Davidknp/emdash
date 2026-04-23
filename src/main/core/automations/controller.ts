import type { CreateAutomationInput, UpdateAutomationInput } from '@shared/automations/types';
import { createRPCController } from '@shared/ipc/rpc';
import { err, ok, type Result } from '@shared/result';
import { automationsService } from '@main/core/automations/AutomationsService';
import { log } from '@main/lib/logger';

async function wrap<T>(scope: string, fn: () => Promise<T>): Promise<Result<T, string>> {
  try {
    return ok(await fn());
  } catch (error) {
    log.error(`[Automations.${scope}]`, error);
    return err(error instanceof Error ? error.message : String(error));
  }
}

export const automationsController = createRPCController({
  list: () => wrap('list', () => automationsService.list()),

  get: (args: { id: string }) => wrap('get', () => automationsService.get(args.id)),

  create: (args: CreateAutomationInput) => wrap('create', () => automationsService.create(args)),

  update: (args: UpdateAutomationInput) => wrap('update', () => automationsService.update(args)),

  delete: (args: { id: string }) => wrap('delete', () => automationsService.delete(args.id)),

  toggle: (args: { id: string }) => wrap('toggle', () => automationsService.toggleStatus(args.id)),

  triggerNow: (args: { id: string }) =>
    wrap('triggerNow', () => automationsService.triggerNow(args.id)),

  runLogs: (args: { automationId: string; limit?: number }) =>
    wrap('runLogs', () => automationsService.getRunLogs(args.automationId, args.limit)),

  getMemory: (args: { id: string }) =>
    wrap('getMemory', () => automationsService.getMemory(args.id)),

  setMemory: (args: { id: string; content: string }) =>
    wrap('setMemory', () => automationsService.setMemory(args.id, args.content)),

  clearMemory: (args: { id: string }) =>
    wrap('clearMemory', () => automationsService.clearMemory(args.id)),
});
