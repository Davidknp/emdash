import { useHotkey } from '@tanstack/react-hotkeys';
import { useAppSettingsKey } from '@renderer/core/app/use-app-settings-key';
import { useShowModal } from '@renderer/core/modal/modal-provider';
import { appState } from '@renderer/core/stores/app-state';
import { useWorkspaceLayoutContext } from '@renderer/core/view/layout-provider';
import { useNavigate, useParams, useWorkspaceSlots } from '@renderer/core/view/navigation-provider';
import { getEffectiveHotkey } from '@renderer/hooks/useKeyboardShortcuts';
import { useTheme } from '@renderer/hooks/useTheme';

/**
 * Mounts global keyboard shortcut handlers for the entire application.
 * Renders nothing — exists only to register useHotkey() calls that are always active.
 * Must be mounted inside all relevant providers (ModalProvider, WorkspaceLayoutContext, etc.).
 */
export function AppKeyboardShortcuts() {
  const { value: keyboard } = useAppSettingsKey('keyboard');
  const showCmdPalette = useShowModal('commandPaletteModal');
  const showNewProject = useShowModal('addProjectModal');
  const showCreateTask = useShowModal('taskModal');
  const { toggleLeft, toggleRight } = useWorkspaceLayoutContext();
  const { toggleTheme } = useTheme();
  const { navigate } = useNavigate();

  // Resolve current project context from whichever view is active
  const { currentView } = useWorkspaceSlots();
  const { params: taskParams } = useParams('task');
  const { params: projectParams } = useParams('project');
  const currentProjectId =
    currentView === 'task'
      ? taskParams.projectId
      : currentView === 'project'
        ? projectParams.projectId
        : undefined;

  useHotkey(getEffectiveHotkey('commandPalette', keyboard), () => showCmdPalette({}));

  // cmd+, toggles settings: open settings, or return to the previous view
  // when already on the settings view.
  useHotkey(getEffectiveHotkey('settings', keyboard), () => {
    if (currentView === 'settings') {
      const prev = appState.navigation.previousViewId ?? 'home';
      navigate(prev);
    } else {
      navigate('settings');
    }
  });

  // ESC inside the settings view returns to the previous view.
  useHotkey(
    'Escape',
    () => {
      const prev = appState.navigation.previousViewId ?? 'home';
      navigate(prev);
    },
    { enabled: currentView === 'settings' }
  );

  useHotkey(getEffectiveHotkey('toggleLeftSidebar', keyboard), () => toggleLeft());

  useHotkey(getEffectiveHotkey('toggleRightSidebar', keyboard), () => toggleRight());

  useHotkey(getEffectiveHotkey('toggleTheme', keyboard), () => toggleTheme());

  useHotkey(getEffectiveHotkey('newProject', keyboard), () =>
    showNewProject({ strategy: 'local', mode: 'pick' })
  );

  useHotkey(
    getEffectiveHotkey('newTask', keyboard),
    () => {
      if (currentProjectId) showCreateTask({ projectId: currentProjectId });
    },
    { enabled: !!currentProjectId }
  );

  return null;
}
