import { useState, useCallback } from "react";

/**
 * A simple boolean toggle hook.
 */
export const useToggle = (initial: boolean = false): {
  value: boolean;
  toggle: () => void;
  setTrue: () => void;
  setFalse: () => void;
} => {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);
  return { value, toggle, setTrue, setFalse };
};
