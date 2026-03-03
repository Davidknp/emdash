import { useState } from 'react';

export function useStableValue<T>(value: T, isEqual: (a: T, b: T) => boolean): T {
  const [state, setState] = useState<{ prev: T; stable: T }>({
    prev: value,
    stable: value,
  });

  if (!isEqual(state.prev, value)) {
    setState({ prev: value, stable: value });
    return value;
  }

  return state.stable;
}

export function useStableArray<T>(value: T[]): T[] {
  return useStableValue(value, (a, b) => a.length === b.length && a.every((v, i) => v === b[i]));
}
