import { useCallback, useEffect, useRef, useState } from 'react';

export type AutoSaveState = 'idle' | 'saving' | 'saved';

type FlushOptions = {
  suppressUi?: boolean;
};

type Options<T> = {
  value: T;
  isEqual: (a: T, b: T) => boolean;
  canSave: (value: T) => boolean;
  onSave: (value: T) => Promise<unknown>;
  delayMs?: number;
  successIdleDelayMs?: number;
};

export function useDebouncedAutoSave<T>({
  value,
  isEqual,
  canSave,
  onSave,
  delayMs = 600,
  successIdleDelayMs = 1200,
}: Options<T>) {
  const [saveState, setSaveState] = useState<AutoSaveState>('idle');
  const latestValueRef = useRef(value);
  const lastSavedRef = useRef(value);
  const queuedValueRef = useRef<T | null>(null);
  const flushPromiseRef = useRef<Promise<boolean> | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const setSaveStateSafe = useCallback(
    (next: AutoSaveState) => {
      if (!isMountedRef.current) return;
      setSaveState(next);
    },
    [setSaveState]
  );

  const showSavedState = useCallback(() => {
    if (!isMountedRef.current) return;
    clearIdleTimer();
    setSaveState('saved');
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      if (!isMountedRef.current) return;
      setSaveState('idle');
    }, successIdleDelayMs);
  }, [clearIdleTimer, successIdleDelayMs]);

  const hasUnsavedChanges = useCallback(
    (nextValue: T = latestValueRef.current) => !isEqual(nextValue, lastSavedRef.current),
    [isEqual]
  );

  const persistQueuedValues = useCallback(
    (suppressUi: boolean): Promise<boolean> => {
      if (flushPromiseRef.current) return flushPromiseRef.current;

      const run = (async () => {
        let didSave = false;

        while (queuedValueRef.current !== null) {
          const nextValue = queuedValueRef.current;
          queuedValueRef.current = null;

          if (!canSave(nextValue) || isEqual(nextValue, lastSavedRef.current)) {
            continue;
          }

          didSave = true;

          if (!suppressUi) {
            clearIdleTimer();
            setSaveStateSafe('saving');
          }

          await onSave(nextValue);
          lastSavedRef.current = nextValue;

          if (!suppressUi) {
            showSavedState();
          }
        }

        return didSave;
      })()
        .catch(() => {
          if (!suppressUi) {
            clearIdleTimer();
            setSaveStateSafe('idle');
          }
          return false;
        })
        .finally(() => {
          flushPromiseRef.current = null;
          if (queuedValueRef.current !== null) {
            void persistQueuedValues(suppressUi);
          }
        });

      flushPromiseRef.current = run;
      return run;
    },
    [canSave, clearIdleTimer, isEqual, onSave, setSaveStateSafe, showSavedState]
  );

  const flushPendingChanges = useCallback(
    (options: FlushOptions = {}): Promise<boolean> => {
      clearDebounceTimer();
      const nextValue = latestValueRef.current;

      if (!canSave(nextValue) || isEqual(nextValue, lastSavedRef.current)) {
        return Promise.resolve(false);
      }

      queuedValueRef.current = nextValue;
      return persistQueuedValues(options.suppressUi ?? false);
    },
    [canSave, clearDebounceTimer, isEqual, persistQueuedValues]
  );

  const replaceSavedValue = useCallback(
    (nextValue: T) => {
      latestValueRef.current = nextValue;
      lastSavedRef.current = nextValue;
      queuedValueRef.current = null;
      clearDebounceTimer();
      clearIdleTimer();
      setSaveStateSafe('idle');
    },
    [clearDebounceTimer, clearIdleTimer, setSaveStateSafe]
  );

  useEffect(() => {
    latestValueRef.current = value;
    clearDebounceTimer();

    if (!canSave(value) || isEqual(value, lastSavedRef.current)) {
      return;
    }

    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void flushPendingChanges();
    }, delayMs);

    return clearDebounceTimer;
  }, [canSave, clearDebounceTimer, delayMs, flushPendingChanges, isEqual, value]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearDebounceTimer();
      clearIdleTimer();
      void flushPendingChanges({ suppressUi: true });
    };
  }, [clearDebounceTimer, clearIdleTimer, flushPendingChanges]);

  return {
    flushPendingChanges,
    hasUnsavedChanges,
    replaceSavedValue,
    saveState,
  };
}
