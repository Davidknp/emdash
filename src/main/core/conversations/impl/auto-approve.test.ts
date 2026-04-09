import { describe, expect, it } from 'vitest';
import { resolveAutoApproveEnabled } from './auto-approve';

describe('resolveAutoApproveEnabled', () => {
  it('returns true when conversation auto-approve is true', () => {
    expect(
      resolveAutoApproveEnabled({
        conversationAutoApprove: true,
        autoApproveByDefault: false,
      })
    ).toBe(true);
  });

  it('returns true when global auto-approve default is true', () => {
    expect(
      resolveAutoApproveEnabled({
        conversationAutoApprove: undefined,
        autoApproveByDefault: true,
      })
    ).toBe(true);
  });

  it('returns true when both are true', () => {
    expect(
      resolveAutoApproveEnabled({
        conversationAutoApprove: true,
        autoApproveByDefault: true,
      })
    ).toBe(true);
  });

  it('returns false when both are false/undefined', () => {
    expect(
      resolveAutoApproveEnabled({
        conversationAutoApprove: undefined,
        autoApproveByDefault: false,
      })
    ).toBe(false);
  });

  it('allows explicit false to override global auto-approve default', () => {
    expect(
      resolveAutoApproveEnabled({
        conversationAutoApprove: false,
        autoApproveByDefault: true,
      })
    ).toBe(false);
  });
});
