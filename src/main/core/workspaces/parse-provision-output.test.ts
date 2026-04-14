import { describe, expect, it } from 'vitest';
import { parseProvisionOutput } from './parse-provision-output';

describe('parseProvisionOutput', () => {
  it('parses minimal valid output (host only)', () => {
    const result = parseProvisionOutput('{"host": "10.0.0.1"}');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.host).toBe('10.0.0.1');
      expect(result.data.port).toBeUndefined();
      expect(result.data.username).toBeUndefined();
      expect(result.data.worktreePath).toBeUndefined();
      expect(result.data.id).toBeUndefined();
    }
  });

  it('parses full valid output with all optional fields', () => {
    const result = parseProvisionOutput(
      JSON.stringify({
        host: 'my-server.example.com',
        port: 2222,
        username: 'deploy',
        worktreePath: '/home/deploy/workspace',
        id: 'instance-abc-123',
      })
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.host).toBe('my-server.example.com');
      expect(result.data.port).toBe(2222);
      expect(result.data.username).toBe('deploy');
      expect(result.data.worktreePath).toBe('/home/deploy/workspace');
      expect(result.data.id).toBe('instance-abc-123');
    }
  });

  it('trims whitespace from stdout and host', () => {
    const result = parseProvisionOutput('  \n {"host": "  server.io  "} \n ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.host).toBe('server.io');
    }
  });

  it('returns error for empty output', () => {
    const result = parseProvisionOutput('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('parse-error');
      expect(result.error.message).toContain('empty output');
    }
  });

  it('returns error for whitespace-only output', () => {
    const result = parseProvisionOutput('   \n  ');
    expect(result.success).toBe(false);
  });

  it('returns error for non-JSON output', () => {
    const result = parseProvisionOutput('Instance ready at 10.0.0.1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('parse-error');
      expect(result.error.message).toContain('Could not parse');
    }
  });

  it('returns error for JSON array', () => {
    const result = parseProvisionOutput('[{"host": "10.0.0.1"}]');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('must be a JSON object');
    }
  });

  it('returns error for missing host field', () => {
    const result = parseProvisionOutput('{"port": 22}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('non-empty "host"');
    }
  });

  it('returns error for empty host field', () => {
    const result = parseProvisionOutput('{"host": "  "}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('non-empty "host"');
    }
  });

  it('returns error for numeric host', () => {
    const result = parseProvisionOutput('{"host": 12345}');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('non-empty "host"');
    }
  });

  it('ignores unknown fields', () => {
    const result = parseProvisionOutput('{"host": "server.io", "extra": true, "foo": "bar"}');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.host).toBe('server.io');
    }
  });

  it('ignores non-string id', () => {
    const result = parseProvisionOutput('{"host": "server.io", "id": 123}');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBeUndefined();
    }
  });

  it('ignores non-number port', () => {
    const result = parseProvisionOutput('{"host": "server.io", "port": "22"}');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.port).toBeUndefined();
    }
  });
});
