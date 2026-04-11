import { describe, expect, it } from 'vitest';
import { projectSettingsSchema } from './schema';

describe('projectSettingsSchema', () => {
  it('parses settings without workspaceProvider', () => {
    const result = projectSettingsSchema.parse({});
    expect(result.workspaceProvider).toBeUndefined();
  });

  it('parses settings with workspaceProvider', () => {
    const result = projectSettingsSchema.parse({
      workspaceProvider: {
        type: 'script',
        provisionCommand: './provision.sh',
        terminateCommand: './terminate.sh',
      },
    });
    expect(result.workspaceProvider).toEqual({
      type: 'script',
      provisionCommand: './provision.sh',
      terminateCommand: './terminate.sh',
    });
  });

  it('rejects workspaceProvider with missing provisionCommand', () => {
    expect(() =>
      projectSettingsSchema.parse({
        workspaceProvider: {
          type: 'script',
          terminateCommand: './terminate.sh',
        },
      })
    ).toThrow();
  });

  it('rejects workspaceProvider with missing terminateCommand', () => {
    expect(() =>
      projectSettingsSchema.parse({
        workspaceProvider: {
          type: 'script',
          provisionCommand: './provision.sh',
        },
      })
    ).toThrow();
  });

  it('rejects workspaceProvider with wrong type', () => {
    expect(() =>
      projectSettingsSchema.parse({
        workspaceProvider: {
          type: 'docker',
          provisionCommand: './provision.sh',
          terminateCommand: './terminate.sh',
        },
      })
    ).toThrow();
  });

  it('preserves other settings alongside workspaceProvider', () => {
    const result = projectSettingsSchema.parse({
      shellSetup: 'nvm use',
      tmux: true,
      workspaceProvider: {
        type: 'script',
        provisionCommand: './p.sh',
        terminateCommand: './t.sh',
      },
    });
    expect(result.shellSetup).toBe('nvm use');
    expect(result.tmux).toBe(true);
    expect(result.workspaceProvider?.type).toBe('script');
  });
});
