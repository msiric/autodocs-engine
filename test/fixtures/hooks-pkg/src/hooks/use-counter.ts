import { useState, useCallback, useMemo } from "react";

export interface CounterOptions {
  min?: number;
  max?: number;
  step?: number;
}

/**
 * A counter hook with min/max bounds.
 */
export const useCounter = (initial: number, options?: CounterOptions): {
  count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
} => {
  const [count, setCount] = useState(initial);
  const step = useMemo(() => options?.step ?? 1, [options?.step]);

  const increment = useCallback(() => {
    setCount((c) => {
      const next = c + step;
      return options?.max !== undefined ? Math.min(next, options.max) : next;
    });
  }, [step, options?.max]);

  const decrement = useCallback(() => {
    setCount((c) => {
      const next = c - step;
      return options?.min !== undefined ? Math.max(next, options.min) : next;
    });
  }, [step, options?.min]);

  const reset = useCallback(() => setCount(initial), [initial]);

  return { count, increment, decrement, reset };
};
