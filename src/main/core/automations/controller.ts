import type { CreateAutomationInput, UpdateAutomationInput } from '@shared/automations/types';
import { createRPCController } from '@shared/ipc/rpc';
import { db } from '@main/db/client';
import { log } from '@main/lib/logger';
import { automationsService } from './automations-service';

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function resolveProjectName(projectId: string): Promise<string | null> {
  const project = await db.query.projects.findFirst({
    where: (p, { eq }) => eq(p.id, projectId),
  });
  return project?.name ?? null;
}

export async function startAutomationsRuntime(): Promise<void> {
  try {
    await automationsService.reconcileMissedRuns();
    automationsService.start();
  } catch (error) {
    log.error('Failed to start automations runtime:', error);
  }
}

export function stopAutomationsRuntime(): void {
  automationsService.stop();
}

export const automationsController = createRPCController({
  list: async () => {
    try {
      return { success: true, data: await automationsService.list() };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  },

  get: async (id: string) => {
    try {
      return { success: true, data: await automationsService.get(id) };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  },

  create: async (input: CreateAutomationInput) => {
    try {
      const projectName = await resolveProjectName(input.projectId);
      if (projectName === null)
        return { success: false, error: `Unknown projectId: ${input.projectId}` };

      const created = await automationsService.create({ ...input, projectName });
      return { success: true, data: created };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  },

  update: async (input: UpdateAutomationInput) => {
    try {
      let projectName = input.projectName;
      if (input.projectId) {
        const resolved = await resolveProjectName(input.projectId);
        if (resolved === null)
          return { success: false, error: `Unknown projectId: ${input.projectId}` };
        projectName = resolved;
      }

      const updated = await automationsService.update({ ...input, projectName });
      return { success: true, data: updated };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  },

  delete: async (id: string) => {
    try {
      return { success: true, data: await automationsService.delete(id) };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  },

  toggle: async (id: string) => {
    try {
      return { success: true, data: await automationsService.toggleStatus(id) };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  },

  runLogs: async (automationId: string, limit?: number) => {
    try {
      return {
        success: true,
        data: await automationsService.getRunLogs(automationId, limit ?? 100),
      };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  },

  triggerNow: async (id: string) => {
    try {
      await automationsService.triggerNow(id);
      return { success: true };
    } catch (error) {
      return { success: false, error: formatError(error) };
    }
  },
});
