import type { Task as SharedTask } from '@shared/tasks';

export interface TaskMetadata {
  automationId?: string;
  [key: string]: unknown;
}

export type Task = SharedTask & {
  metadata?: TaskMetadata;
  activeConversationId?: string | null;
};
