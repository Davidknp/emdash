import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useWorkspaceSlots, useWorkspaceWrapParams } from './navigation-provider';
import type { ViewId } from './registry';

type NavigationHistoryEntry = {
  viewId: ViewId;
  params: Record<string, unknown>;
};

type NavigationHistoryContextValue = {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
};

const MAX_HISTORY = 50;

const NavigationHistoryContext = createContext<NavigationHistoryContextValue | null>(null);

function entriesEqual(a: NavigationHistoryEntry, b: NavigationHistoryEntry): boolean {
  return a.viewId === b.viewId && JSON.stringify(a.params) === JSON.stringify(b.params);
}

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();
  const { wrapParams } = useWorkspaceWrapParams();

  const historyRef = useRef<NavigationHistoryEntry[]>([]);
  const indexRef = useRef(-1);
  const isRestoringRef = useRef(false);

  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  const syncFlags = useCallback(() => {
    setCanGoBack(indexRef.current > 0);
    setCanGoForward(indexRef.current < historyRef.current.length - 1);
  }, []);

  const restoreEntry = useCallback(
    (entry: NavigationHistoryEntry) => {
      isRestoringRef.current = true;
      (navigate as (viewId: ViewId, params?: Record<string, unknown>) => void)(
        entry.viewId,
        entry.params
      );
      queueMicrotask(() => {
        isRestoringRef.current = false;
      });
    },
    [navigate]
  );

  useEffect(() => {
    if (isRestoringRef.current) {
      return;
    }

    const entry: NavigationHistoryEntry = {
      viewId: currentView as ViewId,
      params: wrapParams,
    };

    const history = historyRef.current;
    const idx = indexRef.current;

    if (idx >= 0 && idx < history.length && entriesEqual(history[idx], entry)) {
      return;
    }

    const truncated = history.slice(0, idx + 1);
    truncated.push(entry);

    if (truncated.length > MAX_HISTORY) {
      truncated.splice(0, truncated.length - MAX_HISTORY);
    }

    historyRef.current = truncated;
    indexRef.current = truncated.length - 1;
    syncFlags();
  }, [currentView, wrapParams, syncFlags]);

  const goBack = useCallback(() => {
    if (indexRef.current <= 0) return;
    indexRef.current -= 1;
    syncFlags();
    restoreEntry(historyRef.current[indexRef.current]);
  }, [restoreEntry, syncFlags]);

  const goForward = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    indexRef.current += 1;
    syncFlags();
    restoreEntry(historyRef.current[indexRef.current]);
  }, [restoreEntry, syncFlags]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        goBack();
      } else if (event.button === 4) {
        event.preventDefault();
        goForward();
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [goBack, goForward]);

  useEffect(() => {
    // macOS 2-finger trackpad swipe navigation.
    // Electron's 'swipe' event only fires for 3-finger swipes, so we detect
    // horizontal wheel gestures here and trigger back/forward ourselves.
    let accumX = 0;
    let accumY = 0;
    let triggered = false;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;
    const THRESHOLD = 80;

    const reset = () => {
      accumX = 0;
      accumY = 0;
      triggered = false;
    };

    const handleWheel = (event: WheelEvent) => {
      // Only trackpad gestures produce these continuous, non-integer deltas
      // with deltaMode === 0. Ignore mouse wheels and pinch/ctrl-zoom.
      if (event.ctrlKey || event.deltaMode !== 0) return;

      // Don't hijack scrolling inside scrollable containers.
      let node = event.target as HTMLElement | null;
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        const overflowX = style.overflowX;
        if (
          (overflowX === 'auto' || overflowX === 'scroll') &&
          node.scrollWidth > node.clientWidth
        ) {
          return;
        }
        node = node.parentElement;
      }

      accumX += event.deltaX;
      accumY += event.deltaY;

      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(reset, 200);

      if (triggered) return;
      if (Math.abs(accumX) < Math.abs(accumY) * 1.5) return;

      if (accumX <= -THRESHOLD) {
        triggered = true;
        goBack();
      } else if (accumX >= THRESHOLD) {
        triggered = true;
        goForward();
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [goBack, goForward]);

  useEffect(() => {
    const eventOn = window.electronAPI?.eventOn;
    if (!eventOn) return;

    const offBack = eventOn('navigate:back', () => goBack());
    const offForward = eventOn('navigate:forward', () => goForward());

    return () => {
      offBack();
      offForward();
    };
  }, [goBack, goForward]);

  const value = useMemo(
    () => ({ canGoBack, canGoForward, goBack, goForward }),
    [canGoBack, canGoForward, goBack, goForward]
  );

  return (
    <NavigationHistoryContext.Provider value={value}>{children}</NavigationHistoryContext.Provider>
  );
}

export function useNavigationHistory() {
  const context = useContext(NavigationHistoryContext);
  if (!context) {
    throw new Error('useNavigationHistory must be used within a NavigationHistoryProvider');
  }
  return context;
}
