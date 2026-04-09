import { beforeEach, describe, expect, it, vi } from 'vitest';
import { providerOverrideSettings } from '@main/core/settings/provider-settings-service';
import { buildAgentCommand } from './agent-command';

vi.mock('@main/core/settings/provider-settings-service', () => ({
  providerOverrideSettings: {
    getItem: vi.fn(),
  },
}));

describe('buildAgentCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forces Claude bypassPermissions when auto-approve is enabled', async () => {
    vi.mocked(providerOverrideSettings.getItem).mockResolvedValue({
      cli: 'claude',
      resumeFlag: '--resume',
      autoApproveFlag: '--dangerously-skip-permissions',
      defaultArgs: [],
    });

    const result = await buildAgentCommand({
      providerId: 'claude',
      autoApprove: true,
      sessionId: 'session-1',
      isResuming: false,
    });

    expect(result.command).toBe('claude');
    expect(result.args).toContain('--permission-mode');
    expect(result.args).toContain('bypassPermissions');
    expect(result.args).not.toContain('--dangerously-skip-permissions');
  });

  it('forces Claude default mode when auto-approve is disabled', async () => {
    vi.mocked(providerOverrideSettings.getItem).mockResolvedValue({
      cli: 'claude',
      resumeFlag: '--resume',
      autoApproveFlag: '--dangerously-skip-permissions',
      defaultArgs: [],
    });

    const result = await buildAgentCommand({
      providerId: 'claude',
      autoApprove: false,
      sessionId: 'session-1',
      isResuming: false,
    });

    expect(result.args).toContain('--permission-mode');
    expect(result.args).toContain('default');
  });

  it('splits resumeFlag with spaces when resuming', async () => {
    vi.mocked(providerOverrideSettings.getItem).mockResolvedValue({
      cli: 'opencode',
      resumeFlag: '--resume --force',
      sessionIdFlag: '--session-id',
      autoApproveFlag: '--yes',
      defaultArgs: [],
    });

    const result = await buildAgentCommand({
      providerId: 'opencode',
      autoApprove: false,
      sessionId: 'session-123',
      isResuming: true,
    });

    expect(result.args).toContain('--resume');
    expect(result.args).toContain('--force');
    // When resuming, only the session ID is added (without the flag)
    expect(result.args).toContain('session-123');
  });
});
