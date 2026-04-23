import { Ellipsis, ExternalLink, Trash2 } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import {
  asMounted,
  getProjectManagerStore,
  getProjectStore,
  projectDisplayName,
  projectViewKind,
} from '@renderer/features/projects/stores/project-selectors';
import type { ProjectView } from '@renderer/features/projects/stores/project-view';
import { OpenInMenu } from '@renderer/lib/components/titlebar/open-in-menu';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { useNameWithOwner } from '@renderer/lib/hooks/useNameWithOwner';
import { rpc } from '@renderer/lib/ipc';
import { useNavigate, useParams } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@renderer/lib/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@renderer/lib/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';

export const ProjectTitlebar = observer(function ProjectTitlebar() {
  const {
    params: { projectId },
  } = useParams('project');
  const { navigate } = useNavigate();
  const { data: remoteState } = useNameWithOwner(projectId);
  const store = getProjectStore(projectId);
  const kind = projectViewKind(store);
  const displayName = projectDisplayName(store);
  const githubUrl =
    remoteState?.status === 'ready' ? `https://github.com/${remoteState.nameWithOwner}` : null;

  const showConfirmDeleteProject = useShowModal('confirmActionModal');

  const nameSlot = displayName ? (
    <div className="flex items-center px-2 gap-2">
      <span className="text-sm text-foreground-muted">{displayName}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Project actions"
              className="text-foreground-muted hover:text-foreground"
            />
          }
        >
          <Ellipsis className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-40">
          <DropdownMenuItem
            className="flex items-center gap-2 text-foreground-destructive"
            onClick={() => {
              showConfirmDeleteProject({
                title: 'Delete project',
                description: `"${displayName}" will be deleted. The project folder and worktrees will stay on the filesystem.`,
                confirmLabel: 'Delete',
                onSuccess: () => {
                  void getProjectManagerStore().deleteProject(projectId);
                  navigate('home');
                },
              });
            }}
          >
            <Trash2 className="size-4 " />
            Remove Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {githubUrl && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="View repository on GitHub"
              className="text-foreground-muted hover:text-foreground"
              onClick={() => void rpc.app.openExternal(githubUrl)}
            >
              <ExternalLink className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View repository on GitHub</TooltipContent>
        </Tooltip>
      )}
    </div>
  ) : null;

  if (kind !== 'ready') {
    return <Titlebar leftSlot={nameSlot} />;
  }

  const mounted = asMounted(store);
  if (!mounted) return <Titlebar leftSlot={nameSlot} />;

  const isRemote = mounted.data.type === 'ssh';
  const sshConnectionId = mounted.data.type === 'ssh' ? mounted.data.connectionId : null;

  return (
    <Titlebar
      leftSlot={nameSlot}
      rightSlot={
        <div className="flex items-center gap-2 mr-2">
          {!isRemote && (
            <OpenInMenu
              path={mounted.data.path}
              isRemote={isRemote}
              sshConnectionId={sshConnectionId}
              className="h-7 bg-background"
            />
          )}
          <ToggleGroup
            variant="outline"
            size="sm"
            value={[mounted.view.activeView]}
            className="rounded-lg overflow-hidden shadow-none h-7 border border-border mx-1"
            onValueChange={([value]) => {
              if (value) mounted.view.setProjectView(value as ProjectView);
            }}
          >
            <ToggleGroupItem value="tasks" size="sm">
              Tasks
            </ToggleGroupItem>
            <ToggleGroupItem value="pull-request" size="sm">
              Pull Requests
            </ToggleGroupItem>
            <ToggleGroupItem value="settings" size="sm">
              Settings
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      }
    />
  );
});
