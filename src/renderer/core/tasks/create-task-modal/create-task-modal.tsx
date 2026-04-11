import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, FolderOpen } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useCallback, useState } from 'react';
import type { PullRequest } from '@shared/pull-requests';
import { ProjectSelector } from '@renderer/components/project-selector';
import { useProjectSettings } from '@renderer/components/projects/use-project-settings';
import { AnimatedHeight } from '@renderer/components/ui/animated-height';
import { ComboboxTrigger, ComboboxValue } from '@renderer/components/ui/combobox';
import { ConfirmButton } from '@renderer/components/ui/confirm-button';
import {
  DialogContentArea,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import { Switch } from '@renderer/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group';
import { rpc } from '@renderer/core/ipc';
import { BaseModalProps } from '@renderer/core/modal/modal-provider';
import { useRepository } from '@renderer/core/projects/use-repository';
import { appState } from '@renderer/core/stores/app-state';
import {
  getProjectManagerStore,
  mountedProjectData,
} from '@renderer/core/stores/project-selectors';
import { useNavigate } from '@renderer/core/view/navigation-provider';
import { useFeatureFlag } from '@renderer/hooks/useFeatureFlag';
import { useNameWithOwner } from '@renderer/hooks/useNameWithOwner';
import { FromBranchContent } from './from-branch-content';
import { FromIssueContent } from './from-issue-content';
import { FromPrContent } from './from-pr-content';
import { useFromBranchMode } from './use-from-branch-mode';
import { useFromIssueMode } from './use-from-issue-mode';
import { useFromPullRequestMode } from './use-from-pull-request-mode';

type CreateTaskStrategy = 'from-branch' | 'from-issue' | 'from-pull-request';

export const CreateTaskModal = observer(function CreateTaskModal({
  projectId,
  strategy = 'from-branch',
  initialPR,
  onClose,
}: BaseModalProps & {
  projectId?: string;
  strategy?: CreateTaskStrategy;
  initialPR?: PullRequest;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(() => {
    if (projectId) return projectId;
    const nav = appState.navigation;
    const navProjectId =
      nav.currentViewId === 'task'
        ? (nav.viewParamsStore['task'] as { projectId?: string } | undefined)?.projectId
        : nav.currentViewId === 'project'
          ? (nav.viewParamsStore['project'] as { projectId?: string } | undefined)?.projectId
          : undefined;
    return (
      navProjectId ??
      Array.from(getProjectManagerStore().projects.values())
        .reverse()
        .find((p) => p.state === 'mounted')?.data?.id
    );
  });
  const [selectedStrategy, setSelectedStrategy] = useState<CreateTaskStrategy>(strategy);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { branches, defaultBranch } = useRepository(selectedProjectId);
  const { navigate } = useNavigate();

  const projectData = selectedProjectId
    ? mountedProjectData(getProjectManagerStore().projects.get(selectedProjectId))
    : null;
  const { data: remoteState } = useNameWithOwner(selectedProjectId);
  const nameWithOwner = remoteState?.status === 'ready' ? remoteState.nameWithOwner : undefined;

  const fromBranch = useFromBranchMode(selectedProjectId, branches, defaultBranch);
  const fromIssue = useFromIssueMode(selectedProjectId, branches, defaultBranch);
  const fromPR = useFromPullRequestMode(selectedProjectId, branches, defaultBranch, initialPR);
  const fromPrUnavailable = selectedStrategy === 'from-pull-request' && !nameWithOwner;

  // Workspace provider feature flag + project settings
  const workspaceProviderFlag = useFeatureFlag('workspace-provider');
  const { settings: projectSettings } = useProjectSettings(selectedProjectId ?? '');
  const hasWorkspaceProvider = workspaceProviderFlag && !!projectSettings?.workspaceProvider;
  const [useRemoteWorkspace, setUseRemoteWorkspace] = useState(false);
  const queryClient = useQueryClient();

  const activeMode = {
    'from-branch': fromBranch,
    'from-issue': fromIssue,
    'from-pull-request': fromPR,
  }[selectedStrategy];
  const canCreate = !!selectedProjectId && activeMode.isValid && !fromPrUnavailable;

  const handleCreateTask = useCallback(() => {
    if (!selectedProjectId) return;
    const id = crypto.randomUUID();
    const projectStore = getProjectManagerStore().projects.get(selectedProjectId);
    if (projectStore?.state !== 'mounted') return;

    // Determine strategy: workspace-provider overrides other strategies
    const resolveStrategy = () => {
      if (useRemoteWorkspace && hasWorkspaceProvider) {
        return { kind: 'workspace-provider' as const };
      }

      switch (selectedStrategy) {
        case 'from-branch':
          if (!fromBranch.selectedBranch) return undefined;
          return fromBranch.createBranchAndWorktree
            ? {
                kind: 'new-branch' as const,
                taskBranch: fromBranch.taskName,
                pushBranch: fromBranch.pushBranch,
              }
            : { kind: 'no-worktree' as const };
        case 'from-issue':
          return { kind: 'no-worktree' as const };
        case 'from-pull-request':
          if (!fromPR.linkedPR) return undefined;
          return fromPR.checkoutMode === 'checkout'
            ? {
                kind: 'from-pull-request' as const,
                prNumber: fromPR.linkedPR.metadata.number,
                headBranch: fromPR.linkedPR.metadata.headRefName,
              }
            : {
                kind: 'from-pull-request' as const,
                prNumber: fromPR.linkedPR.metadata.number,
                headBranch: fromPR.linkedPR.metadata.headRefName,
                taskBranch: fromPR.taskName,
              };
      }
    };

    const resolvedStrategy = resolveStrategy();
    if (!resolvedStrategy) return;

    const sourceBranch = (() => {
      switch (selectedStrategy) {
        case 'from-branch':
          return fromBranch.selectedBranch
            ? { branch: fromBranch.selectedBranch.branch, remote: fromBranch.selectedBranch.remote }
            : { branch: defaultBranch?.name ?? 'main' };
        case 'from-issue':
          return fromIssue.selectedBranch
            ? { branch: fromIssue.selectedBranch.branch, remote: fromIssue.selectedBranch.remote }
            : { branch: defaultBranch?.name ?? 'main' };
        case 'from-pull-request':
          return fromPR.linkedPR
            ? { branch: fromPR.linkedPR.metadata.headRefName }
            : { branch: defaultBranch?.name ?? 'main' };
      }
    })();

    const taskName =
      selectedStrategy === 'from-branch'
        ? fromBranch.taskName
        : selectedStrategy === 'from-issue'
          ? fromIssue.taskName
          : fromPR.taskName;

    // Navigate immediately for fast UX; the task manager will handle
    // state transitions in the background.
    navigate('task', { projectId: selectedProjectId, taskId: id });
    onClose();

    void (async () => {
      try {
        await projectStore.mountedProject!.taskManager.createTask({
          id,
          projectId: selectedProjectId,
          name: taskName,
          sourceBranch,
          strategy: resolvedStrategy,
          linkedIssue:
            selectedStrategy === 'from-issue' ? (fromIssue.linkedIssue ?? undefined) : undefined,
        });

        // After task creation, trigger workspace provisioning if using remote workspace.
        // Awaited so the workspace_instances row exists before downstream consumers query it.
        if (useRemoteWorkspace && hasWorkspaceProvider && projectSettings?.workspaceProvider) {
          const remotes = await rpc.repository.getRemotes(selectedProjectId);
          const originRemote = remotes.find((r) => r.name === 'origin');
          const repoUrl = originRemote?.url ?? remotes[0]?.url ?? '';
          await rpc.workspaceProvider.provision({
            taskId: id,
            repoUrl,
            branch: sourceBranch.branch,
            baseRef: defaultBranch?.name ?? 'main',
            provisionCommand: projectSettings.workspaceProvider.provisionCommand,
            projectPath: projectData?.path ?? '',
          });
          // Main-panel.tsx mounted before provision returned — invalidate so its
          // useWorkspaceInstance query picks up the newly-inserted instance row.
          await queryClient.invalidateQueries({ queryKey: ['workspaceInstance', id] });
        }
      } catch (e) {
        // Task manager surfaces errors via task store state; swallow here to
        // avoid unhandled promise rejections.
        console.error('Failed to create task:', e);
      }
    })();
  }, [
    selectedProjectId,
    selectedStrategy,
    fromBranch,
    fromIssue,
    fromPR,
    navigate,
    onClose,
    useRemoteWorkspace,
    hasWorkspaceProvider,
    projectSettings,
    projectData,
    defaultBranch,
    queryClient,
  ]);

  return (
    <>
      <DialogHeader className="flex items-center gap-2">
        <ProjectSelector
          value={selectedProjectId}
          onChange={setSelectedProjectId}
          trigger={
            <ComboboxTrigger className="h-6 flex items-center gap-2 border border-border rounded-md px-2.5 py-1 text-sm outline-none">
              <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
              <ComboboxValue placeholder="Select a project" />
            </ComboboxTrigger>
          }
        />
        <ChevronRight className="size-3.5 text-foreground-passive" />
        <DialogTitle>Create Task</DialogTitle>
      </DialogHeader>
      <DialogContentArea className="gap-4">
        <ToggleGroup
          className="w-full"
          value={[selectedStrategy]}
          onValueChange={([value]) => {
            if (value) {
              setSelectedStrategy(value as CreateTaskStrategy);
            }
          }}
        >
          <ToggleGroupItem className="flex-1" value="from-branch">
            From Branch
          </ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="from-issue">
            From Issue
          </ToggleGroupItem>
          <ToggleGroupItem className="flex-1" value="from-pull-request">
            From Pull Request
          </ToggleGroupItem>
        </ToggleGroup>
        {hasWorkspaceProvider && (
          <div className="flex items-center justify-between rounded-md border border-border bg-background-1 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground-muted">Use remote workspace</span>
              <button
                type="button"
                onClick={() =>
                  void rpc.app.openExternal('https://docs.emdash.sh/bring-your-own-infrastructure')
                }
                className="group inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <span className="transition-colors group-hover:text-foreground">Docs</span>
                <span className="transition-colors group-hover:text-foreground">↗</span>
              </button>
            </div>
            <Switch checked={useRemoteWorkspace} onCheckedChange={setUseRemoteWorkspace} />
          </div>
        )}
        <AnimatedHeight onAnimatingChange={setIsTransitioning}>
          {selectedStrategy === 'from-branch' && (
            <FromBranchContent state={fromBranch} branches={branches} />
          )}
          {selectedStrategy === 'from-issue' && (
            <FromIssueContent
              state={fromIssue}
              branches={branches}
              nameWithOwner={nameWithOwner}
              projectPath={projectData?.path}
              disabled={isTransitioning}
            />
          )}
          {selectedStrategy === 'from-pull-request' && (
            <div className="flex flex-col gap-3">
              {!nameWithOwner && (
                <p className="text-sm text-muted-foreground">
                  {remoteState?.status === 'no_remote'
                    ? 'No remote is configured for this project.'
                    : 'Pull requests are currently available only for GitHub remotes.'}
                </p>
              )}
              <FromPrContent
                state={fromPR}
                projectId={selectedProjectId}
                nameWithOwner={nameWithOwner}
                disabled={isTransitioning || fromPrUnavailable}
              />
            </div>
          )}
        </AnimatedHeight>
      </DialogContentArea>
      <DialogFooter>
        <ConfirmButton size="sm" onClick={handleCreateTask} disabled={!canCreate}>
          Create
        </ConfirmButton>
      </DialogFooter>
    </>
  );
});
