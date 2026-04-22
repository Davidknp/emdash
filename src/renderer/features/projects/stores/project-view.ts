import { makeAutoObservable } from 'mobx';
import type { ProjectViewSnapshot } from '@shared/view-state';
import type { Snapshottable } from '@renderer/lib/stores/snapshottable';

export type ProjectView = 'tasks' | 'pull-request' | 'settings';

export class ProjectViewStore implements Snapshottable<ProjectViewSnapshot> {
  activeView: ProjectView = 'tasks';
  previousNonSettingsView: Exclude<ProjectView, 'settings'> = 'tasks';
  taskView: TaskViewStore = new TaskViewStore();

  constructor() {
    makeAutoObservable(this);
  }

  setProjectView(view: ProjectView) {
    if (view !== 'settings') {
      this.previousNonSettingsView = view;
    } else if (this.activeView !== 'settings') {
      this.previousNonSettingsView = this.activeView;
    }
    this.activeView = view;
  }

  closeSettings() {
    this.activeView = this.previousNonSettingsView;
  }

  get snapshot(): ProjectViewSnapshot {
    return {
      activeView: this.activeView,
      taskViewTab: this.taskView.tab,
    };
  }

  restoreSnapshot(snapshot: Partial<ProjectViewSnapshot>): void {
    if (snapshot.activeView) this.activeView = snapshot.activeView as ProjectView;
    if (snapshot.taskViewTab) this.taskView.setTab(snapshot.taskViewTab);
  }
}

class TaskViewStore {
  tab: 'active' | 'archived' = 'active';
  searchQuery: string = '';
  selectedIds: Set<string> = new Set();

  constructor() {
    makeAutoObservable(this);
  }

  setTab(tab: 'active' | 'archived') {
    this.tab = tab;
  }

  setSearchQuery(query: string) {
    this.searchQuery = query;
  }

  setSelectedIds(ids: Set<string>) {
    this.selectedIds = ids;
  }

  toggleSelect(id: string) {
    this.selectedIds.has(id) ? this.selectedIds.delete(id) : this.selectedIds.add(id);
  }
}
