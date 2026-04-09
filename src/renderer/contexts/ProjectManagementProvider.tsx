import { appState } from '@renderer/core/stores/app-state';
import type { Project } from '@renderer/types/app';

export function useProjectManagementContext(): {
  projects: Project[];
  isInitialLoadComplete: boolean;
} {
  const projects: Project[] = [];
  for (const store of appState.projects.projects.values()) {
    if (store.data) projects.push(store.data);
  }
  return {
    projects,
    isInitialLoadComplete: true,
  };
}
