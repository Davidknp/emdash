import { describe, expect, it } from 'vitest';
import { ProjectViewStore } from '@renderer/features/projects/stores/project-view';

describe('ProjectViewStore', () => {
  it('returns to the previous non-settings view when project settings closes', () => {
    const store = new ProjectViewStore();

    store.setProjectView('pull-request');
    store.setProjectView('settings');
    store.closeSettings();

    expect(store.activeView).toBe('pull-request');
  });

  it('falls back to tasks when project settings closes without prior navigation', () => {
    const store = new ProjectViewStore();

    store.setProjectView('settings');
    store.closeSettings();

    expect(store.activeView).toBe('tasks');
  });
});
