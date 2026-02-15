import { useState, useEffect } from "react";

/**
 * Syncs state with localStorage.
 */
export const useLocalStorage = <T>(key: string, defaultValue: T): {
  value: T;
  setValue: (val: T) => void;
  remove: () => void;
} => {
  const [value, setValueState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded — ignore
    }
  }, [key, value]);

  const setValue = (val: T) => setValueState(val);
  const remove = () => {
    localStorage.removeItem(key);
    setValueState(defaultValue);
  };

  return { value, setValue, remove };
};
