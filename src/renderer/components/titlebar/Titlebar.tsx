import { ChevronLeft, ChevronRight, PanelLeft, PanelRight } from 'lucide-react';
import { ReactNode } from 'react';
import { Button } from '@renderer/components/ui/button';
import { Toggle } from '@renderer/components/ui/toggle';
import { useNavigationHistory } from '@renderer/core/view/navigation-history-provider';
import { useWorkspaceLayoutContext } from '@renderer/core/view/layout-provider';
import { useWorkspaceSlots } from '@renderer/core/view/navigation-provider';
import { cn } from '@renderer/lib/utils';
import ShortcutHint from '../ui/shortcut-hint';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export function Titlebar({ leftSlot, rightSlot }: { leftSlot?: ReactNode; rightSlot?: ReactNode }) {
  const { isRightOpen, setCollapsed, isLeftOpen } = useWorkspaceLayoutContext();
  const { RightPanel } = useWorkspaceSlots();
  const { canGoBack, canGoForward, goBack, goForward } = useNavigationHistory();
  return (
    <header
      className={cn(
        'flex h-10 shrink-0 items-center bg-background-1 pr-2 border-b border-border [-webkit-app-region:drag] dark:bg-background',
        !isLeftOpen && 'pl-17'
      )}
    >
      <div className="pointer-events-auto flex w-full items-center gap-1">
        {!isLeftOpen && <div className="[-webkit-app-region:no-drag]"></div>}
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center justify-start [-webkit-app-region:no-drag]">
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={!canGoBack}
                  onClick={() => goBack()}
                  aria-label="Go back"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Go back
                <ShortcutHint settingsKey="navigateBack" />
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={!canGoForward}
                  onClick={() => goForward()}
                  aria-label="Go forward"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Go forward
                <ShortcutHint settingsKey="navigateForward" />
              </TooltipContent>
            </Tooltip>
            {!isLeftOpen && (
              <Tooltip>
                <TooltipTrigger>
                  <Toggle
                    pressed={isLeftOpen}
                    variant="outline"
                    size="sm"
                    className="ml-2 size-7"
                    onPressedChange={() => setCollapsed('left', isLeftOpen)}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                  Toggle left sidebar
                  <ShortcutHint settingsKey="toggleLeftSidebar" />
                </TooltipContent>
              </Tooltip>
            )}
            {leftSlot}
          </div>
          <div className="flex items-center justify-end [-webkit-app-region:no-drag]">
            {rightSlot}
            <Tooltip>
              <TooltipTrigger>
                <Toggle
                  disabled={!RightPanel}
                  pressed={isRightOpen}
                  size="sm"
                  variant="outline"
                  onPressedChange={() => setCollapsed('right', isRightOpen)}
                >
                  <PanelRight className="size-3.5" />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                Toggle right sidebar
                <ShortcutHint settingsKey="toggleRightSidebar" />
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </header>
  );
}
