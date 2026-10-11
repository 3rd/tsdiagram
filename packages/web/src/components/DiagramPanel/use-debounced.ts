import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, delay = 500, resetToken?: unknown): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const [lastResetToken, setLastResetToken] = useState(resetToken);

  if (resetToken !== lastResetToken) {
    setLastResetToken(resetToken);
    setDebouncedValue(value);
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);

    return () => {
      clearTimeout(timer);
    };
  }, [delay, value]);

  return debouncedValue;
}
