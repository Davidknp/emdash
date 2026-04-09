import type { TaskLifecycleStatus } from '@shared/tasks';

export function TaskStatusIndicator({ status }: { status: TaskLifecycleStatus }) {
  const color =
    status === 'done'
      ? 'bg-emerald-500'
      : status === 'in_progress'
        ? 'bg-blue-500'
        : status === 'review'
          ? 'bg-amber-500'
          : 'bg-zinc-500';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} aria-label={status} />;
}
