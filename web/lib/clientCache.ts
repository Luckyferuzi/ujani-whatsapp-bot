"use client";

type Listener = () => void;

export type CacheEntry<T> = {
  data?: T;
  error?: Error | null;
  updatedAt: number;
  promise?: Promise<T>;
  listeners: Set<Listener>;
};

const store = new Map<string, CacheEntry<unknown>>();

function ensureEntry<T>(key: string): CacheEntry<T> {
  const existing = store.get(key) as CacheEntry<T> | undefined;
  if (existing) return existing;

  const created: CacheEntry<T> = {
    updatedAt: 0,
    listeners: new Set(),
  };
  store.set(key, created as CacheEntry<unknown>);
  return created;
}

function notify(entry: CacheEntry<unknown>) {
  for (const listener of entry.listeners) listener();
}

export function subscribeCache(key: string, listener: Listener) {
  const entry = ensureEntry(key);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

export function getCacheEntry<T>(key: string): CacheEntry<T> | undefined {
  return store.get(key) as CacheEntry<T> | undefined;
}

export function setCachedData<T>(key: string, data: T) {
  const entry = ensureEntry<T>(key);
  entry.data = data;
  entry.error = null;
  entry.updatedAt = Date.now();
  entry.promise = undefined;
  notify(entry);
}

export function setCachedError(key: string, error: Error) {
  const entry = ensureEntry(key);
  entry.error = error;
  entry.promise = undefined;
  notify(entry);
}

export function invalidateCache(key: string) {
  const entry = ensureEntry(key);
  entry.updatedAt = 0;
  entry.promise = undefined;
  notify(entry);
}

export function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { force?: boolean }
) {
  const entry = ensureEntry<T>(key);

  if (!opts?.force && entry.promise) {
    return entry.promise;
  }

  const promise = fetcher()
    .then((data) => {
      entry.data = data;
      entry.error = null;
      entry.updatedAt = Date.now();
      entry.promise = undefined;
      notify(entry);
      return data;
    })
    .catch((error) => {
      const normalized = error instanceof Error ? error : new Error(String(error));
      entry.error = normalized;
      entry.promise = undefined;
      notify(entry);
      throw normalized;
    });

  entry.promise = promise;
  notify(entry);
  return promise;
}
