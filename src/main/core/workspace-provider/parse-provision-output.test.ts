import { describe, expect, it } from 'vitest';
import { parseProvisionOutput } from './parse-provision-output';

describe('parseProvisionOutput', () => {
  it('parses valid minimal output (host only)', () => {
    const result = parseProvisionOutput(JSON.stringify({ host: '192.168.1.100' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.host).toBe('192.168.1.100');
      expect(result.data.port).toBeUndefined();
      expect(result.data.username).toBeUndefined();
      expect(result.data.id).toBeUndefined();
      expect(result.data.worktreePath).toBeUndefined();
    }
  });

  it('parses valid full output', () => {
    const input = {
      host: 'dev-vm.example.com',
      id: 'i-1234567890abcdef0',
      port: 2222,
      username: 'ubuntu',
      worktreePath: '/home/ubuntu/workspace',
    };
    const result = parseProvisionOutput(JSON.stringify(input));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('trims whitespace around JSON', () => {
    const result = parseProvisionOutput('  \n  {"host": "example.com"}  \n  ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.host).toBe('example.com');
    }
  });

  it('rejects empty string', () => {
    const result = parseProvisionOutput('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('empty');
    }
  });

  it('rejects whitespace-only string', () => {
    const result = parseProvisionOutput('   \n\n   ');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('empty');
    }
  });

  it('rejects invalid JSON', () => {
    const result = parseProvisionOutput('not json at all');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('invalid-json');
    }
  });

  it('rejects array output', () => {
    const result = parseProvisionOutput('[{"host": "example.com"}]');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
    }
  });

  it('rejects missing host', () => {
    const result = parseProvisionOutput(JSON.stringify({ port: 22, username: 'root' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
    }
  });

  it('rejects empty host string', () => {
    const result = parseProvisionOutput(JSON.stringify({ host: '' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
    }
  });

  it('rejects invalid port type', () => {
    const result = parseProvisionOutput(JSON.stringify({ host: 'example.com', port: 'abc' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
    }
  });

  it('rejects negative port', () => {
    const result = parseProvisionOutput(JSON.stringify({ host: 'example.com', port: -1 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('validation');
    }
  });
});
