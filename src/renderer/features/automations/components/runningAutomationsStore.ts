import { automationRunStatusChannel } from '@shared/events/automationEvents';
import { events } from '@renderer/lib/ipc';

const runningIds = new Set<string>();
const listeners = new Set<() => void>();
let initialized = false;
const endedCallbacks = new Set<(automationId: string) => void>();

function notify() {
  for (const l of listeners) l();
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  events.on(automationRunStatusChannel, (payload) => {
    if (payload.status === 'started') {
      runningIds.add(payload.automationId);
    } else {
      runningIds.delete(payload.automationId);
      for (const cb of endedCallbacks) cb(payload.automationId);
    }
    notify();
  });
}

export function subscribe(listener: () => void): () => void {
  ensureInitialized();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRunningSnapshot(): ReadonlySet<string> {
  return runningIds;
}

export function isAutomationRunning(automationId: string): boolean {
  return runningIds.has(automationId);
}

/**
 * Register a callback invoked whenever any automation run ends.
 * Used by useAutomations to trigger react-query invalidation.
 */
export function onAnyRunEnded(cb: (automationId: string) => void): () => void {
  ensureInitialized();
  endedCallbacks.add(cb);
  return () => {
    endedCallbacks.delete(cb);
  };
}
