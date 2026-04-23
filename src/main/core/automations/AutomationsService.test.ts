import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutomationsService, automationsService } from './AutomationsService';

const mocks = vi.hoisted(() => ({
  getProjectByIdMock: vi.fn(),
  selectMock: vi.fn(),
  fromMock: vi.fn(),
  whereMock: vi.fn(),
  limitMock: vi.fn(),
  updateMock: vi.fn(),
  setMock: vi.fn(),
  updateWhereMock: vi.fn(),
}));

vi.mock('@main/core/issues/registry', () => ({
  getIssueProvider: vi.fn(),
}));

vi.mock('@main/core/projects/operations/getProjects', () => ({
  getProjectById: mocks.getProjectByIdMock,
}));

vi.mock('@main/core/tasks/createTask', () => ({
  createTask: vi.fn(),
}));

vi.mock('@main/db/client', () => ({
  db: {
    select: mocks.selectMock,
    update: mocks.updateMock,
  },
}));

vi.mock('@main/lib/events', () => ({
  events: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock('@main/lib/logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const legacyTriggerRow = {
  id: 'auto-1',
  name: 'Legacy PR automation',
  projectId: 'project-1',
  projectName: 'Project 1',
  prompt: 'Review PRs',
  agentId: 'codex',
  mode: 'trigger',
  schedule: JSON.stringify({ type: 'daily', hour: 9, minute: 0 }),
  triggerType: 'github_pr',
  triggerConfig: null,
  useWorktree: 1,
  status: 'active',
  lastRunAt: null,
  nextRunAt: null,
  runCount: 0,
  lastRunResult: null,
  lastRunError: null,
  createdAt: '2026-04-19T08:00:00.000Z',
  updatedAt: '2026-04-19T08:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();

  mocks.selectMock.mockReturnValue({ from: mocks.fromMock });
  mocks.fromMock.mockReturnValue({ where: mocks.whereMock });
  mocks.whereMock.mockReturnValue({ limit: mocks.limitMock });
  mocks.limitMock.mockResolvedValue([legacyTriggerRow]);

  mocks.updateMock.mockReturnValue({ set: mocks.setMock });
  mocks.setMock.mockReturnValue({ where: mocks.updateWhereMock });
  mocks.updateWhereMock.mockResolvedValue(undefined);
});

describe('automationsService.update', () => {
  it('keeps legacy trigger automations editable when only other fields change', async () => {
    const updated = await automationsService.update({
      id: legacyTriggerRow.id,
      name: 'Renamed legacy PR automation',
    });

    expect(updated).toMatchObject({
      id: legacyTriggerRow.id,
      name: 'Renamed legacy PR automation',
      triggerType: 'github_pr',
    });
    expect(mocks.setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Renamed legacy PR automation',
        triggerType: 'github_pr',
      })
    );
  });

  it('allows the editor to resubmit the unchanged legacy trigger type', async () => {
    const updated = await automationsService.update({
      id: legacyTriggerRow.id,
      prompt: 'Handle legacy PR updates',
      mode: 'trigger',
      triggerType: 'github_pr',
    });

    expect(updated).toMatchObject({
      id: legacyTriggerRow.id,
      prompt: 'Handle legacy PR updates',
      triggerType: 'github_pr',
    });
    expect(mocks.setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Handle legacy PR updates',
        triggerType: 'github_pr',
      })
    );
  });

  it('ignores invalid schedule updates while automation remains in trigger mode', async () => {
    const updated = await automationsService.update({
      id: legacyTriggerRow.id,
      mode: 'trigger',
      schedule: { type: 'custom', rrule: '' },
      prompt: 'Keep this in trigger mode',
    });

    expect(updated).toMatchObject({
      id: legacyTriggerRow.id,
      mode: 'trigger',
      prompt: 'Keep this in trigger mode',
    });
    expect(mocks.setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        schedule: legacyTriggerRow.schedule,
      })
    );
  });
});

describe('automationsService.updateRunLog', () => {
  it('clears the in-flight marker on terminal status', async () => {
    const service = new AutomationsService();
    // @ts-expect-error — access private field for test-only state setup
    service.inFlightRuns.add('auto-xyz');

    await service.updateRunLog(
      'run-1',
      { status: 'success', finishedAt: '2026-04-23T10:00:00Z' },
      'auto-xyz'
    );

    // @ts-expect-error — access private field for test-only state inspection
    expect(service.inFlightRuns.has('auto-xyz')).toBe(false);
  });

  it('leaves the in-flight marker alone for non-terminal updates', async () => {
    const service = new AutomationsService();
    // @ts-expect-error — access private field for test-only state setup
    service.inFlightRuns.add('auto-abc');

    await service.updateRunLog('run-2', { taskId: 'task-1' }, 'auto-abc');

    // @ts-expect-error — access private field for test-only state inspection
    expect(service.inFlightRuns.has('auto-abc')).toBe(true);
  });

  it('isolates state between independent service instances', () => {
    const a = new AutomationsService();
    const b = new AutomationsService();
    // @ts-expect-error — access private field for test-only state setup
    a.inFlightRuns.add('shared-id');
    // @ts-expect-error — access private field for test-only state inspection
    expect(b.inFlightRuns.has('shared-id')).toBe(false);
  });
});
