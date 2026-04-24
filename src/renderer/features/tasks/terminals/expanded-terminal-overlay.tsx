import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { shouldCloseExpandedTerminal } from '@renderer/features/tasks/terminals/expanded-terminal';
import { cn } from '@renderer/utils/utils';

interface ExpandedTerminalOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
}

export function ExpandedTerminalOverlay({
  children,
  onClose,
}: ExpandedTerminalOverlayProps): React.ReactElement | null {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!shouldCloseExpandedTerminal(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleKeyDown]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col" data-expanded-terminal="true">
      <button
        aria-label="Close expanded terminal"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative z-10 m-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl'
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
