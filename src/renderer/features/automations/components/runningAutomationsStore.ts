import { automationRunStatusChannel } from '@shared/events/automationEvents';
import { events } from '@renderer/lib/ipc';

const activeRunLogsByAutomation = new Map<string, Set<string>>();
const listeners = new Set<() => void>();
const endedCallbacks = new Set<(automationId: string) => void>();

let unsubscribe: (() => void) | null = null;
let cachedSnapshot: ReadonlySet<string> = new Set();
let snapshotDirty = false;

function invalidateSnapshot(): void {
  snapshotDirty = true;
}

function addRunningRun(automationId: string, runLogId: string): void {
  const activeRuns = activeRunLogsByAutomation.get(automationId) ?? new Set<string>();
  activeRuns.add(runLogId);
  activeRunLogsByAutomation.set(automationId, activeRuns);
  invalidateSnapshot();
}

function removeRunningRun(automationId: string, runLogId: string): void {
  const activeRuns = activeRunLogsByAutomation.get(automationId);
  if (!activeRuns) return;
  activeRuns.delete(runLogId);
  if (activeRuns.size === 0) {
    activeRunLogsByAutomation.delete(automationId);
  }
  invalidateSnapshot();
}

function notify(): void {
  for (const l of listeners) l();
}

/**
 * Wire the store to the IPC run-status channel. Call once at app bootstrap.
 * Returns an unsubscribe for tests / hot-reload cleanup.
 */
export function startRunningAutomationsStore(): () => void {
  if (unsubscribe) return unsubscribe;
  const off = events.on(automationRunStatusChannel, (payload) => {
    if (payload.status === 'started') {
      addRunningRun(payload.automationId, payload.runLogId);
    } else {
      removeRunningRun(payload.automationId, payload.runLogId);
      for (const cb of endedCallbacks) cb(payload.automationId);
    }
    notify();
  });
  unsubscribe = () => {
    off();
    unsubscribe = null;
  };
  return unsubscribe;
}

export function subscribe(listener: () => void): () => void {
  startRunningAutomationsStore();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRunningSnapshot(): ReadonlySet<string> {
  if (snapshotDirty) {
    cachedSnapshot = new Set(activeRunLogsByAutomation.keys());
    snapshotDirty = false;
  }
  return cachedSnapshot;
}

export function isAutomationRunning(automationId: string): boolean {
  return activeRunLogsByAutomation.has(automationId);
}

/**
 * Register a callback invoked whenever any automation run ends.
 * Used by useAutomations to trigger react-query invalidation.
 */
export function onAnyRunEnded(cb: (automationId: string) => void): () => void {
  startRunningAutomationsStore();
  endedCallbacks.add(cb);
  return () => {
    endedCallbacks.delete(cb);
  };
}
