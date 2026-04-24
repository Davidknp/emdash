import { describe, expect, it } from 'vitest';
import { shouldCloseExpandedTerminal } from '@renderer/features/tasks/terminals/expanded-terminal';

describe('expanded-terminal', () => {
  it('closes on Escape', () => {
    expect(shouldCloseExpandedTerminal({ key: 'Escape' })).toBe(true);
  });

  it('ignores other keys', () => {
    expect(shouldCloseExpandedTerminal({ key: 'Enter' })).toBe(false);
  });
});
