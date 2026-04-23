import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const userDataDir = mkdtempSync(join(tmpdir(), 'emdash-memory-test-'));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return userDataDir;
      throw new Error(`Unexpected app.getPath: ${name}`);
    },
  },
}));

vi.mock('@main/lib/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeAll(() => {
  // ensure module sees our mocks
});

afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

describe('automation memory path safety', () => {
  it('rejects ids containing path separators', async () => {
    const { getAutomationMemoryDir } = await import('./memory');
    expect(() => getAutomationMemoryDir('..')).toThrow(/Invalid automation id/);
    expect(() => getAutomationMemoryDir('../../etc/passwd')).toThrow(/Invalid automation id/);
    expect(() => getAutomationMemoryDir('a/b')).toThrow(/Invalid automation id/);
    expect(() => getAutomationMemoryDir('a\\b')).toThrow(/Invalid automation id/);
  });

  it('rejects ids with nul bytes or dots', async () => {
    const { getAutomationMemoryDir } = await import('./memory');
    expect(() => getAutomationMemoryDir('a\0b')).toThrow(/Invalid automation id/);
    expect(() => getAutomationMemoryDir('auto.evil')).toThrow(/Invalid automation id/);
  });

  it('rejects the empty id', async () => {
    const { getAutomationMemoryDir } = await import('./memory');
    expect(() => getAutomationMemoryDir('')).toThrow(/Invalid automation id/);
  });

  it('accepts well-formed ids and produces a path under userData/automations', async () => {
    const { getAutomationMemoryDir, getAutomationMemoryFilePath } = await import('./memory');
    const dir = getAutomationMemoryDir('auto_0123456789abcdef');
    expect(dir.startsWith(join(userDataDir, 'automations'))).toBe(true);
    expect(getAutomationMemoryFilePath('auto_0123456789abcdef')).toBe(join(dir, 'memory.md'));
  });

  it('seeds and returns default content on first read', async () => {
    const { loadAutomationMemory, getAutomationMemoryFilePath } = await import('./memory');
    const id = 'auto_seedtest00000001';
    const result = await loadAutomationMemory(id);
    expect(result.path).toBe(getAutomationMemoryFilePath(id));
    expect(result.content).toContain('Automation Memory');
    const onDisk = await readFile(result.path, 'utf8');
    expect(onDisk).toBe(result.content);
  });

  it('round-trips writes via writeAutomationMemory', async () => {
    const { writeAutomationMemory, loadAutomationMemory } = await import('./memory');
    const id = 'auto_rw000000000000a1';
    await writeAutomationMemory(id, 'hello world');
    const { content } = await loadAutomationMemory(id);
    expect(content).toBe('hello world');
  });

  it('resetAutomationMemory restores the seed', async () => {
    const { writeAutomationMemory, resetAutomationMemory } = await import('./memory');
    const id = 'auto_reset00000000ff01';
    await writeAutomationMemory(id, 'user notes');
    const { content } = await resetAutomationMemory(id);
    expect(content).toContain('Automation Memory');
  });
});

describe('buildMemoryPromptSection', () => {
  it('marks content as UNTRUSTED and fences it', async () => {
    const { buildMemoryPromptSection } = await import('./memory');
    const section = buildMemoryPromptSection('/some/path/memory.md', 'prior notes');
    expect(section).toContain('UNTRUSTED');
    expect(section).toContain('prior notes');
    expect(section).toMatch(/```markdown[\s\S]*```/);
  });

  it('uses a longer fence when content contains triple backticks', async () => {
    const { buildMemoryPromptSection } = await import('./memory');
    const body = 'code:\n```\nimport os\n```\nend';
    const section = buildMemoryPromptSection('/x/memory.md', body);
    // content must appear verbatim and not be truncated by its own fence
    expect(section).toContain(body);
    // opening fence should be at least 4 backticks
    expect(section).toMatch(/````+markdown/);
  });

  it('renders an empty placeholder for whitespace-only content', async () => {
    const { buildMemoryPromptSection } = await import('./memory');
    const section = buildMemoryPromptSection('/x/memory.md', '   \n\n   ');
    expect(section).toContain('(empty');
  });

  it('redacts the home directory in the displayed path', async () => {
    const { buildMemoryPromptSection } = await import('./memory');
    const home = process.env.HOME ?? '/Users/you';
    const section = buildMemoryPromptSection(`${home}/Library/memory.md`, 'x');
    expect(section).toContain('~/Library/memory.md');
    expect(section).not.toContain(home);
  });
});
