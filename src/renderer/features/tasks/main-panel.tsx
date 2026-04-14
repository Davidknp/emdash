import { Loader2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import type { Task } from '@shared/tasks';
import { isRegistered } from '@renderer/features/tasks/stores/task';
import {
  getTaskStore,
  taskErrorMessage,
  taskViewKind,
} from '@renderer/features/tasks/stores/task-selectors';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import { ConversationsPanel } from './conversations/conversations-panel';
import { DiffView } from './diff-view/main-panel/diff-view';
import { EditorMainPanel } from './editor/editor-main-panel';
import { useWorkspaceInstance } from './hooks/use-workspace-instance';
import { WorkspaceProvisioningOverlay } from './workspace-provisioning-overlay';

export const TaskMainPanel = observer(function TaskMainPanel() {
  const { projectId, taskId } = useTaskViewContext();
  const taskStore = getTaskStore(projectId, taskId);
  const kind = taskViewKind(taskStore, projectId);

  if (kind === 'creating') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
        <p className="text-xs font-mono text-muted-foreground/50">Creating task</p>
      </div>
    );
  }

  if (kind === 'create-error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8">
        <div className="flex max-w-xs flex-col items-center text-center gap-2">
          <p className="text-sm font-medium font-mono text-destructive">Error creating task</p>
          <p className="text-xs font-mono text-muted-foreground/70">
            {taskErrorMessage(taskStore)}
          </p>
        </div>
      </div>
    );
  }

  if (kind === 'project-mounting' || kind === 'provisioning') {
    const isWorkspaceProvider =
      taskStore && isRegistered(taskStore) && (taskStore.data as Task).usesWorkspaceProvider;
    if (isWorkspaceProvider) {
      return <WorkspaceProvisioningView taskId={taskId} />;
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
        <p className="text-xs font-mono text-muted-foreground/50">Setting up workspace…</p>
      </div>
    );
  }

  if (kind === 'provision-error' || kind === 'project-error') {
    const isWorkspaceProvider =
      taskStore && isRegistered(taskStore) && (taskStore.data as Task).usesWorkspaceProvider;
    if (isWorkspaceProvider) {
      return <WorkspaceProvisioningView taskId={taskId} />;
    }
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8">
        <div className="flex max-w-xs flex-col items-center text-center gap-2">
          <p className="text-sm font-medium font-mono text-destructive">
            Failed to set up workspace
          </p>
          <p className="text-xs font-mono text-muted-foreground/70">
            {taskErrorMessage(taskStore)}
          </p>
        </div>
      </div>
    );
  }

  if (kind === 'idle' || kind === 'teardown') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
        <p className="text-xs font-mono text-muted-foreground/50">Setting up workspace…</p>
      </div>
    );
  }

  if (kind === 'teardown-error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-8">
        <div className="flex max-w-xs flex-col items-center text-center gap-2">
          <p className="text-sm font-medium font-mono text-destructive">
            Failed to tear down workspace
          </p>
          <p className="text-xs font-mono text-muted-foreground/70">
            {taskErrorMessage(taskStore)}
          </p>
        </div>
      </div>
    );
  }

  if (kind === 'missing') {
    return null;
  }

  return <ReadyTaskMainPanel />;
});

const WorkspaceProvisioningView = observer(function WorkspaceProvisioningView({
  taskId,
}: {
  taskId: string;
}) {
  const { projectId } = useTaskViewContext();
  const taskStore = getTaskStore(projectId, taskId);
  const { data: instance, isLoading } = useWorkspaceInstance(taskId);
  const taskError = taskStore?.errorMessage;

  if (isLoading || !instance) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
        <p className="text-xs font-mono text-muted-foreground/50">Preparing workspace…</p>
      </div>
    );
  }

  return <WorkspaceProvisioningOverlay taskId={taskId} instance={instance} taskError={taskError} />;
});

const ReadyTaskMainPanel = observer(function ReadyTaskMainPanel() {
  const { taskView } = useProvisionedTask();

  switch (taskView.view) {
    case 'agents':
      return <ConversationsPanel />;
    case 'editor':
      return <EditorMainPanel />;
    case 'diff':
      return <DiffView />;
  }
});
