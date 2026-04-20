import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook } from 'vitest-browser-react/pure';
import type { Automation } from '@shared/automations/types';
import { AutomationRow } from '@renderer/features/automations/components/AutomationRow';
import { useDebouncedAutoSave } from '@renderer/features/automations/components/useDebouncedAutoSave';
import { TooltipProvider } from '@renderer/lib/ui/tooltip';

vi.mock('@renderer/features/automations/components/useAutomations', () => ({
  useIsAutomationRunning: () => false,
}));

vi.mock('@renderer/lib/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
}));

const sampleAutomation: Automation = {
  id: 'auto-1',
  name: 'Daily triage',
  projectId: 'project-1',
  projectName: 'Project 1',
  prompt: 'Triage issues',
  agentId: 'codex',
  mode: 'schedule',
  schedule: { type: 'daily', hour: 9, minute: 0 },
  triggerType: null,
  triggerConfig: null,
  useWorktree: true,
  status: 'active',
  lastRunAt: null,
  nextRunAt: null,
  runCount: 3,
  lastRunResult: null,
  lastRunError: null,
  createdAt: '2026-04-19T08:00:00.000Z',
  updatedAt: '2026-04-19T08:00:00.000Z',
};

afterEach(async () => {
  await cleanup();
});

it('flushes pending autosaves when the editor unmounts before the debounce fires', async () => {
  const onSave = vi.fn(async () => undefined);

  const hook = await renderHook(
    (props?: { name: string }) =>
      useDebouncedAutoSave({
        value: { name: props?.name ?? '' },
        isEqual: (a, b) => a.name === b.name,
        canSave: (value) => value.name.trim().length > 0,
        onSave,
        delayMs: 600,
      }),
    { initialProps: { name: 'Initial' } }
  );

  await hook.rerender({ name: 'Updated before close' });
  await hook.unmount();

  await vi.waitFor(() => {
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  expect(onSave).toHaveBeenCalledWith({ name: 'Updated before close' });
});

it('does not open the editor when Enter is pressed on a nested row action', async () => {
  const onEdit = vi.fn();
  const onToggle = vi.fn();

  const screen = await render(
    <TooltipProvider>
      <AutomationRow
        automation={sampleAutomation}
        onToggle={onToggle}
        onDelete={vi.fn()}
        onTriggerNow={vi.fn()}
        onShowLogs={vi.fn()}
        onEdit={onEdit}
      />
    </TooltipProvider>
  );

  const pauseButtonElement = screen.container.querySelector(
    '[aria-label="Pause"]'
  ) as HTMLButtonElement | null;
  expect(pauseButtonElement).not.toBeNull();
  if (!pauseButtonElement) {
    throw new Error('Pause button not found');
  }
  pauseButtonElement.focus();
  pauseButtonElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  pauseButtonElement.click();

  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(onEdit).not.toHaveBeenCalled();
});
