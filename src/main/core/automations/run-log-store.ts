import { desc, eq, inArray } from 'drizzle-orm';
import type { AutomationRunLog } from '@shared/automations/types';
import { db } from '@main/db/client';
import {
  automationRunLogs as automationRunLogsTable,
  automations as automationsTable,
} from '@main/db/schema';

const MAX_RUNS_PER_AUTOMATION = 100;
const MAX_TOTAL_RUNS = 2000;

export async function insertRunLog(runLog: AutomationRunLog): Promise<void> {
  await db
    .insert(automationRunLogsTable)
    .values({
      id: runLog.id,
      automationId: runLog.automationId,
      startedAt: runLog.startedAt,
      finishedAt: runLog.finishedAt,
      status: runLog.status,
      error: runLog.error,
      taskId: runLog.taskId,
    })
    .onConflictDoNothing();

  await pruneRunLogs(runLog.automationId);
}

/**
 * Atomically advance an automation's scheduling cursor and insert its run-log.
 * Used to close the gap where a crash between the two statements would skip a
 * run without recording why.
 */
export function startRunAtomic(params: {
  automationId: string;
  nowIso: string;
  runCount: number;
  nextRunAt: string | null;
  runLogId: string;
}): void {
  db.transaction((tx) => {
    tx.update(automationsTable)
      .set({
        lastRunAt: params.nowIso,
        runCount: params.runCount,
        nextRunAt: params.nextRunAt,
        updatedAt: params.nowIso,
      })
      .where(eq(automationsTable.id, params.automationId))
      .run();

    tx.insert(automationRunLogsTable)
      .values({
        id: params.runLogId,
        automationId: params.automationId,
        startedAt: params.nowIso,
        finishedAt: null,
        status: 'running',
        error: null,
        taskId: null,
      })
      .onConflictDoNothing()
      .run();
  });
}

export async function pruneRunLogs(automationId: string): Promise<void> {
  const perAutomationRows = await db
    .select({ id: automationRunLogsTable.id })
    .from(automationRunLogsTable)
    .where(eq(automationRunLogsTable.automationId, automationId))
    .orderBy(desc(automationRunLogsTable.startedAt), desc(automationRunLogsTable.id));

  if (perAutomationRows.length > MAX_RUNS_PER_AUTOMATION) {
    const idsToDelete = perAutomationRows.slice(MAX_RUNS_PER_AUTOMATION).map((row) => row.id);
    await db.delete(automationRunLogsTable).where(inArray(automationRunLogsTable.id, idsToDelete));
  }

  const allRows = await db
    .select({ id: automationRunLogsTable.id })
    .from(automationRunLogsTable)
    .orderBy(desc(automationRunLogsTable.startedAt), desc(automationRunLogsTable.id));

  if (allRows.length > MAX_TOTAL_RUNS) {
    const idsToDelete = allRows.slice(MAX_TOTAL_RUNS).map((row) => row.id);
    await db.delete(automationRunLogsTable).where(inArray(automationRunLogsTable.id, idsToDelete));
  }
}

export async function persistRunLogUpdate(
  runId: string,
  update: Partial<Pick<AutomationRunLog, 'status' | 'error' | 'finishedAt' | 'taskId'>>
): Promise<void> {
  const patch: Partial<{
    status: AutomationRunLog['status'];
    error: string | null;
    finishedAt: string | null;
    taskId: string | null;
  }> = {};
  if (update.status !== undefined) patch.status = update.status;
  if (update.error !== undefined) patch.error = update.error;
  if (update.finishedAt !== undefined) patch.finishedAt = update.finishedAt;
  if (update.taskId !== undefined) patch.taskId = update.taskId;

  if (Object.keys(patch).length === 0) return;

  await db.update(automationRunLogsTable).set(patch).where(eq(automationRunLogsTable.id, runId));
}

export async function writeLastRunResult(
  automationId: string,
  result: 'success' | 'failure',
  error?: string
): Promise<void> {
  await db
    .update(automationsTable)
    .set({
      lastRunResult: result,
      lastRunError: error ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(automationsTable.id, automationId));
}
