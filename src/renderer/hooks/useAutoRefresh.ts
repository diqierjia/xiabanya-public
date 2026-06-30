import { useEffect, useRef, useState } from 'react';

interface UseAutoRefreshOptions {
  interval: number; // ms
  enabled: boolean;
  callback: () => void | Promise<void>;
}

export function useAutoRefresh({ interval, enabled, callback }: UseAutoRefreshOptions) {
  const callbackRef = useRef(callback);
  const [isRefreshing, setIsRefreshing] = useState(false);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(async () => {
      setIsRefreshing(true);
      try {
        await callbackRef.current();
      } finally {
        setIsRefreshing(false);
      }
    }, interval);
    return () => clearInterval(id);
  }, [enabled, interval]);

  const refresh = async () => {
    setIsRefreshing(true);
    try {
      await callbackRef.current();
    } finally {
      setIsRefreshing(false);
    }
  };

  return { refresh, isRefreshing };
}
