/**
 * Simple in-memory log cache for workspace provisioning.
 * Keyed by instanceId. Survives component remounts but not app restarts.
 */
const cache = new Map<string, string[]>();

export function getProvisionLogs(instanceId: string): string[] {
  return cache.get(instanceId) ?? [];
}

export function appendProvisionLog(instanceId: string, line: string): void {
  const lines = cache.get(instanceId) ?? [];
  lines.push(line);
  cache.set(instanceId, lines);
}

export function clearProvisionLogs(instanceId: string): void {
  cache.delete(instanceId);
}
