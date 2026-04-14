import { err, ok, type Result } from '@shared/result';

export type ProvisionOutput = {
  host: string;
  id?: string;
  port?: number;
  username?: string;
  worktreePath?: string;
};

export type ParseError = { type: 'parse-error'; message: string };

export function parseProvisionOutput(stdout: string): Result<ProvisionOutput, ParseError> {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return err({ type: 'parse-error', message: 'Provisioner returned empty output' });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return err({
      type: 'parse-error',
      message: `Could not parse provisioner output as JSON: ${trimmed.slice(0, 200)}`,
    });
  }

  if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
    return err({
      type: 'parse-error',
      message: 'Provisioner output must be a JSON object, not an array or primitive',
    });
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.host !== 'string' || !obj.host.trim()) {
    return err({
      type: 'parse-error',
      message: 'Provisioner output must contain a non-empty "host" field',
    });
  }

  return ok({
    host: obj.host.trim(),
    id: typeof obj.id === 'string' ? obj.id : undefined,
    port: typeof obj.port === 'number' ? obj.port : undefined,
    username: typeof obj.username === 'string' ? obj.username : undefined,
    worktreePath: typeof obj.worktreePath === 'string' ? obj.worktreePath : undefined,
  });
}
