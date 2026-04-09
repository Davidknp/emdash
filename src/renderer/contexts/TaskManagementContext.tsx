import type { Task } from '@renderer/types/chat';

export function useTaskManagementContext(): {
  tasksByProjectId: Record<string, Task[]>;
  handleDeleteTask: (_projectId: string, _taskId: string) => Promise<void>;
  handleSelectTask: (_taskId: Task | string) => void;
} {
  return {
    tasksByProjectId: {},
    handleDeleteTask: async () => {},
    handleSelectTask: () => {},
  };
}
