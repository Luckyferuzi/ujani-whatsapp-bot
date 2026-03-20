"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchWithCache,
  getCacheEntry,
  invalidateCache,
  setCachedData,
  subscribeCache,
} from "@/lib/clientCache";

type UseCachedQueryOptions<T> = {
  enabled?: boolean;
  staleMs?: number;
  initialData?: T;
};

type UseCachedQueryResult<T> = {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  isRefreshing: boolean;
  refetch: () => Promise<T | undefined>;
  mutate: (updater: T | ((current: T | undefined) => T)) => void;
};

export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: UseCachedQueryOptions<T> = {}
): UseCachedQueryResult<T> {
  const { enabled = true, staleMs = 15_000, initialData } = options;

  const readSnapshot = useCallback(() => {
    if (!key) {
      return {
        data: initialData,
        error: null,
        isLoading: false,
        isRefreshing: false,
      };
    }

    const entry = getCacheEntry<T>(key);
    const data = entry?.data ?? initialData;
    const hasData = typeof data !== "undefined";
    const isLoading = enabled && !hasData && Boolean(entry?.promise);
    const isRefreshing = enabled && hasData && Boolean(entry?.promise);

    return {
      data,
      error: (entry?.error as Error | null | undefined) ?? null,
      isLoading,
      isRefreshing,
    };
  }, [enabled, initialData, key]);

  const [state, setState] = useState(readSnapshot);

  useEffect(() => {
    setState(readSnapshot());
  }, [readSnapshot]);

  useEffect(() => {
    if (!key) return;
    return subscribeCache(key, () => {
      setState(readSnapshot());
    });
  }, [key, readSnapshot]);

  const runFetch = useCallback(
    async (force = false) => {
      if (!key || !enabled) return undefined;
      return fetchWithCache(key, fetcher, { force });
    },
    [enabled, fetcher, key]
  );

  useEffect(() => {
    if (!key || !enabled) return;

    const entry = getCacheEntry<T>(key);
    const hasData = typeof entry?.data !== "undefined";
    const isFresh = hasData && Date.now() - (entry?.updatedAt ?? 0) < staleMs;

    if (!hasData || !isFresh) {
      void runFetch(!hasData);
    }
  }, [enabled, key, runFetch, staleMs]);

  const refetch = useCallback(async () => runFetch(true), [runFetch]);

  const mutate = useCallback(
    (updater: T | ((current: T | undefined) => T)) => {
      if (!key) return;
      const current = getCacheEntry<T>(key)?.data;
      const next = typeof updater === "function" ? (updater as (value: T | undefined) => T)(current) : updater;
      setCachedData(key, next);
    },
    [key]
  );

  return useMemo(
    () => ({
      data: state.data,
      error: state.error,
      isLoading: state.isLoading,
      isRefreshing: state.isRefreshing,
      refetch,
      mutate,
    }),
    [mutate, refetch, state]
  );
}

export { invalidateCache, setCachedData };
