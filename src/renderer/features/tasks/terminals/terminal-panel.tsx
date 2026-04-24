import { useHotkey } from '@tanstack/react-hotkeys';
import { LayoutList, Maximize2, Minimize2, Play, Terminal } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { makePtySessionId } from '@shared/ptySessionId';
import { asMounted, getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { TabbedPtyPanel } from '@renderer/features/tasks/tabbed-pty-panel';
import { useProvisionedTask, useTaskViewContext } from '@renderer/features/tasks/task-view-context';
import {
  getEffectiveHotkey,
  getHotkeyRegistration,
} from '@renderer/lib/hooks/useKeyboardShortcuts';
import { useTabShortcuts } from '@renderer/lib/hooks/useTabShortcuts';
import { rpc } from '@renderer/lib/ipc';
import { useWorkspaceLayoutContext } from '@renderer/lib/layout/layout-provider';
import { PtySession } from '@renderer/lib/pty/pty-session';
import { TabViewProvider } from '@renderer/lib/stores/generic-tab-view';
import { Button } from '@renderer/lib/ui/button';
import { EmptyState } from '@renderer/lib/ui/empty-state';
import { ShortcutHint } from '@renderer/lib/ui/shortcut-hint';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { log } from '@renderer/utils/logger';
import { cn } from '@renderer/utils/utils';
import { useIsActiveTask } from '../hooks/use-is-active-task';
import { ExpandedTerminalOverlay } from './expanded-terminal-overlay';
import {
  getTerminalsPaneSize,
  nextTerminalName,
  ScriptsTabs,
  TerminalsTabs,
} from './terminal-tabs';

type PanelMode = 'terminals' | 'scripts';

type AnyPtyEntity = { data: { id: string }; session: PtySession };

export const TerminalsPanel = observer(function TerminalsPanel() {
  const { projectId, taskId } = useTaskViewContext();
  const provisionedTask = useProvisionedTask();
  const terminalMgr = provisionedTask.terminals;
  const terminalTabView = provisionedTask.taskView.terminalTabs;
  const lifecycleScriptsMgr = provisionedTask.workspace.lifecycleScripts ?? null;
  const { value: keyboard } = useAppSettingsKey('keyboard');
  const { isRightOpen } = useWorkspaceLayoutContext();
  const isActive = useIsActiveTask(taskId);
  const mountedProject = asMounted(getProjectStore(projectId));
  const remoteConnectionId =
    mountedProject?.data.type === 'ssh' ? mountedProject.data.connectionId : undefined;
  const [isPanelFocused, setIsPanelFocused] = useState(false);
  const [mode, setMode] = useState<PanelMode>('terminals');
  const [isExpanded, setIsExpanded] = useState(false);
  const newTerminalHotkey = getEffectiveHotkey('newTerminal', keyboard);

  const autoFocus = isActive && isRightOpen && provisionedTask.taskView.focusedRegion === 'right';

  useEffect(() => {
    if (!isRightOpen || mode !== 'terminals' || !terminalTabView.activeTab) {
      setIsExpanded(false);
    }
  }, [isRightOpen, mode, terminalTabView.activeTab]);

  const handleCreate = async () => {
    if (!terminalMgr) return;
    provisionedTask.taskView.setFocusedRegion('right');
    const id = crypto.randomUUID();
    const name = nextTerminalName((terminalTabView.tabs ?? []).map((s) => s.data.name));
    try {
      await terminalMgr.createTerminal({
        id,
        projectId,
        taskId,
        name,
        initialSize: getTerminalsPaneSize(),
      });
      terminalTabView.setActiveTab(id);
    } catch (error) {
      log.error('Failed to create terminal:', error);
    }
  };

  const handleRunScript = () => {
    const activeScript = lifecycleScriptsMgr?.activeTab;
    if (!activeScript) return;
    void rpc.terminals.runLifecycleScript({
      projectId,
      workspaceId: provisionedTask.workspaceId,
      type: activeScript.data.type,
    });
  };

  const toggleExpanded = () => {
    provisionedTask.taskView.setFocusedRegion('right');
    setIsExpanded((prev) => !prev);
  };

  const activeStore = mode === 'terminals' ? terminalTabView : lifecycleScriptsMgr;
  useTabShortcuts(activeStore ?? undefined, { focused: isPanelFocused });
  useHotkey(getHotkeyRegistration('newTerminal', keyboard), () => void handleCreate(), {
    enabled: mode === 'terminals' && newTerminalHotkey !== null,
  });

  const runScriptButton = (
    <Tooltip>
      <TooltipTrigger>
        <button
          className="size-10 justify-center items-center flex border-l hover:bg-background text-foreground-muted hover:text-foreground"
          onClick={handleRunScript}
        >
          <Play className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Run script</TooltipContent>
    </Tooltip>
  );

  const toggleButton = lifecycleScriptsMgr ? (
    <div className="flex items-center border-l">
      <Tooltip>
        <TooltipTrigger>
          <button
            className={cn(
              'size-10 flex items-center justify-center',
              mode === 'terminals'
                ? 'text-foreground bg-background-2'
                : 'text-foreground-muted hover:text-foreground'
            )}
            onClick={() => setMode('terminals')}
          >
            <Terminal className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Terminals</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          <button
            className={cn(
              'size-10 flex items-center justify-center',
              mode === 'scripts'
                ? 'text-foreground bg-background-2'
                : 'text-foreground-muted hover:text-foreground'
            )}
            onClick={() => setMode('scripts')}
          >
            <LayoutList className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Lifecycle Scripts</TooltipContent>
      </Tooltip>
    </div>
  ) : null;

  const store = (mode === 'terminals' ? terminalTabView : lifecycleScriptsMgr) as
    | TabViewProvider<AnyPtyEntity, never>
    | undefined;

  const expandButton =
    mode === 'terminals' && terminalTabView.activeTab ? (
      <Tooltip>
        <TooltipTrigger>
          <button
            className="size-10 flex items-center justify-center border-l text-foreground-muted hover:bg-background hover:text-foreground"
            onClick={toggleExpanded}
          >
            {isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{isExpanded ? 'Collapse terminal' : 'Expand terminal'}</TooltipContent>
      </Tooltip>
    ) : null;

  const tabBar =
    mode === 'terminals' ? (
      <TerminalsTabs
        projectId={projectId}
        taskId={taskId}
        terminalTabView={terminalTabView}
        terminalMgr={terminalMgr}
        actions={
          <div className="flex items-center">
            {expandButton}
            {toggleButton}
          </div>
        }
      />
    ) : (
      <ScriptsTabs
        lifecycleScriptsMgr={lifecycleScriptsMgr}
        actions={
          <div className="flex items-center">
            {lifecycleScriptsMgr?.tabs.length ? runScriptButton : null}
            {toggleButton}
          </div>
        }
      />
    );

  const emptyState =
    mode === 'terminals' ? (
      <EmptyState
        icon={<Terminal className="h-5 w-5 text-muted-foreground" />}
        label="No terminals yet"
        description="Add a terminal to run shell commands in this task's working directory."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={handleCreate}
            className="flex items-center gap-2"
          >
            New terminal
            <ShortcutHint settingsKey="newTerminal" />
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<LayoutList className="h-5 w-5 text-muted-foreground" />}
        label="No lifecycle scripts"
        description="Add setup or run scripts to .emdash.json to see them here."
        action={
          <Button size="sm" variant="outline" onClick={() => setMode('terminals')}>
            Back to terminals
          </Button>
        }
      />
    );

  const panel = (
    <TabbedPtyPanel
      autoFocus={autoFocus}
      onFocusChange={(focused) => {
        setIsPanelFocused(focused);
        if (focused) provisionedTask.taskView.setFocusedRegion('right');
      }}
      store={store}
      paneId={mode === 'terminals' ? 'terminals' : 'lifecycle-scripts'}
      getSessionId={(s) => makePtySessionId(projectId, taskId, s.data.id)}
      getSession={(s) => s.session}
      remoteConnectionId={remoteConnectionId}
      tabBar={tabBar}
      emptyState={emptyState}
    />
  );

  if (isExpanded) {
    return (
      <ExpandedTerminalOverlay onClose={() => setIsExpanded(false)}>
        {panel}
      </ExpandedTerminalOverlay>
    );
  }

  return panel;
});
