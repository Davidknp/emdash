import { AppKeyboardShortcuts } from '@renderer/components/AppKeyboardShortcuts';
import { LeftSidebar } from '@renderer/components/sidebar/left-sidebar';
import { Toaster } from '@renderer/components/ui/toaster';
import { ModalRenderer } from '@renderer/core/modal/modal-renderer';
import { NavigationHistoryProvider } from '@renderer/core/view/navigation-history-provider';
import {
  useViewLayoutOverride,
  useWorkspaceSlots,
  useWorkspaceWrapParams,
} from '@renderer/core/view/navigation-provider';
import { WorkspaceContentLayout, WorkspaceLayout } from '@renderer/core/view/workspace-layout';
import { useTheme } from '@renderer/hooks/useTheme';

export function Workspace() {
  useTheme();
  const { WrapView } = useWorkspaceSlots();
  const { wrapParams } = useWorkspaceWrapParams();
  return (
    <NavigationHistoryProvider>
      <AppKeyboardShortcuts />
      <WorkspaceLayout
        leftSidebar={<LeftSidebar />}
        mainContent={
          <WrapView {...wrapParams}>
            <ModalRenderer />
            <WorkspaceViewContent />
          </WrapView>
        }
      />
      <Toaster />
    </NavigationHistoryProvider>
  );
}

function WorkspaceViewContent() {
  const { TitlebarSlot, MainPanel, RightPanel } = useWorkspaceSlots();
  const { hideRightPanel } = useViewLayoutOverride();
  const EffectiveRightPanel = hideRightPanel ? null : RightPanel;
  return (
    <WorkspaceContentLayout
      titlebarSlot={<TitlebarSlot />}
      mainPanel={<MainPanel />}
      rightPanel={EffectiveRightPanel ? <EffectiveRightPanel /> : null}
    />
  );
}
