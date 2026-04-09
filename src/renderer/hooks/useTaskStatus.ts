import type { Task } from '@renderer/types/chat';

export function useTaskStatus(task: Task) {
  return {
    status: task.status,
    isRunning: task.status === 'in_progress',
  };
}
