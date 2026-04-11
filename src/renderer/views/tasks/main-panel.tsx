import { Loader2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { WorkspaceProvisioningOverlay } from '@renderer/components/workspace-provisioning-overlay';
import {
  getTaskManagerStore,
  getTaskStore,
  getTaskView,
  taskErrorMessage,
  taskViewKind,
} from '@renderer/core/stores/task-selectors';
import { useWorkspaceInstance } from '@renderer/hooks/useWorkspaceInstance';
import { ConversationsPanel } from './conversations/conversations-panel';
import { DiffView } from './diff-view/main-panel/diff-view';
import { EditorMainPanel } from './editor/editor-main-panel';
import { useTaskViewContext } from './task-view-context';

export const TaskMainPanel = observer(function TaskMainPanel() {
  const { projectId, taskId } = useTaskViewContext();
  const taskStore = getTaskStore(projectId, taskId);
  const kind = taskViewKind(taskStore, projectId);
  const { instance: workspaceInstance, refetch: refetchInstance } = useWorkspaceInstance(taskId);

  // When a workspace-provider workspace transitions to `ready`, trigger the task's
  // normal provisioning path (now that the remote workspace is available).
  useEffect(() => {
    if (workspaceInstance?.status === 'ready') {
      void getTaskManagerStore(projectId)?.provisionTask(taskId);
    }
  }, [workspaceInstance?.status, projectId, taskId]);

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

  // Show provisioning overlay with live logs when a workspace instance is being provisioned
  if (
    workspaceInstance &&
    (workspaceInstance.status === 'provisioning' || workspaceInstance.status === 'error')
  ) {
    return (
      <WorkspaceProvisioningOverlay
        instanceId={workspaceInstance.id}
        status={workspaceInstance.status}
        onRetry={() => void refetchInstance()}
      />
    );
  }

  if (kind === 'project-mounting' || kind === 'provisioning') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
        <p className="text-xs font-mono text-muted-foreground/50">Setting up workspace…</p>
      </div>
    );
  }

  if (kind === 'provision-error' || kind === 'project-error') {
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

const ReadyTaskMainPanel = observer(function ReadyTaskMainPanel() {
  const { projectId, taskId } = useTaskViewContext();
  const taskView = getTaskView(projectId, taskId);
  if (!taskView) return null;

  switch (taskView.view) {
    case 'agents':
      return <ConversationsPanel />;
    case 'editor':
      return <EditorMainPanel />;
    case 'diff':
      return <DiffView />;
  }
});
