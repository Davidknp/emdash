import { useHotkey } from '@tanstack/react-hotkeys';
import { observer } from 'mobx-react-lite';
import { asMounted, getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { toast } from '@renderer/lib/hooks/use-toast';
import {
  getEffectiveHotkey,
  getHotkeyRegistration,
} from '@renderer/lib/hooks/useKeyboardShortcuts';
import { useTheme } from '@renderer/lib/hooks/useTheme';
import { useWorkspaceLayoutContext } from '@renderer/lib/layout/layout-provider';
import {
  isAuxiliaryTopLevelView,
  useCloseAuxiliaryView,
  useNavigate,
  useParams,
  useWorkspaceSlots,
} from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { modalStore } from '@renderer/lib/modal/modal-store';

const ESCAPE_DISMISS_BLOCKERS_SELECTOR = [
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="select-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
  '[data-slot="context-menu-content"]',
  '[data-slot="context-menu-sub-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="combobox-content"]',
].join(', ');

function hasOpenEscapeDismissBlocker(): boolean {
  return modalStore.isOpen || document.querySelector(ESCAPE_DISMISS_BLOCKERS_SELECTOR) !== null;
}

/**
 * Mounts global keyboard shortcut handlers for the entire application.
 * Renders nothing — exists only to register useHotkey() calls that are always active.
 * Must be mounted inside all relevant providers (ModalProvider, WorkspaceLayoutContext, etc.).
 */
export const AppKeyboardShortcuts = observer(function AppKeyboardShortcuts() {
  const { value: keyboard } = useAppSettingsKey('keyboard');
  const showNewProject = useShowModal('addProjectModal');
  const showCreateTask = useShowModal('taskModal');
  const { toggleLeft, toggleRight } = useWorkspaceLayoutContext();
  const { toggleTheme } = useTheme();
  const { navigate } = useNavigate();
  const closeAuxiliaryView = useCloseAuxiliaryView();
  const commandPaletteHotkey = getEffectiveHotkey('commandPalette', keyboard);
  const closeModalHotkey = getEffectiveHotkey('closeModal', keyboard);
  const settingsHotkey = getEffectiveHotkey('settings', keyboard);
  const toggleLeftSidebarHotkey = getEffectiveHotkey('toggleLeftSidebar', keyboard);
  const toggleRightSidebarHotkey = getEffectiveHotkey('toggleRightSidebar', keyboard);
  const toggleThemeHotkey = getEffectiveHotkey('toggleTheme', keyboard);
  const newProjectHotkey = getEffectiveHotkey('newProject', keyboard);
  const newTaskHotkey = getEffectiveHotkey('newTask', keyboard);

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
  const mountedProject =
    currentView === 'project' ? asMounted(getProjectStore(projectParams.projectId)) : undefined;
  const isProjectSettingsOpen = mountedProject?.view.activeView === 'settings';
  const canDismissAuxiliaryView = isAuxiliaryTopLevelView(currentView) || isProjectSettingsOpen;

  useHotkey(
    getHotkeyRegistration('commandPalette', keyboard),
    () => toast({ title: 'CMDK coming soon' }),
    { enabled: commandPaletteHotkey !== null }
  );

  useHotkey(getHotkeyRegistration('settings', keyboard), () => navigate('settings'), {
    enabled: settingsHotkey !== null,
  });

  useHotkey(
    getHotkeyRegistration('closeModal', keyboard),
    (event) => {
      if (event.defaultPrevented) return;
      if (hasOpenEscapeDismissBlocker()) return;

      if (isProjectSettingsOpen) {
        mountedProject?.view.closeSettings();
        return;
      }

      if (isAuxiliaryTopLevelView(currentView)) {
        closeAuxiliaryView();
      }
    },
    { enabled: closeModalHotkey !== null && canDismissAuxiliaryView }
  );

  useHotkey(getHotkeyRegistration('toggleLeftSidebar', keyboard), () => toggleLeft(), {
    enabled: toggleLeftSidebarHotkey !== null,
  });

  useHotkey(getHotkeyRegistration('toggleRightSidebar', keyboard), () => toggleRight(), {
    enabled: toggleRightSidebarHotkey !== null,
  });

  useHotkey(getHotkeyRegistration('toggleTheme', keyboard), () => toggleTheme(), {
    enabled: toggleThemeHotkey !== null,
  });

  useHotkey(
    getHotkeyRegistration('newProject', keyboard),
    () => showNewProject({ strategy: 'local', mode: 'pick' }),
    { enabled: newProjectHotkey !== null }
  );

  useHotkey(
    getHotkeyRegistration('newTask', keyboard),
    () => {
      if (currentProjectId) showCreateTask({ projectId: currentProjectId });
    },
    { enabled: !!currentProjectId && newTaskHotkey !== null }
  );

  return null;
});
