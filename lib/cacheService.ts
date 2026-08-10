// lib/cacheService.ts
// In-memory cache layer that mimics Redis/cache store without external dependencies,
// keeping deployment clean and risk-free.

interface CacheEntry {
  value: any;
  expiresAt: number | null;
}

const GLOBAL_CACHE_KEY = Symbol.for("sportsfan.inmemory.cache");

// Ensure hot reloads in Next.js development don't wipe the cache
const cacheStore: Map<string, CacheEntry> = (global as any)[GLOBAL_CACHE_KEY] || new Map<string, CacheEntry>();
if (process.env.NODE_ENV !== "production") {
  (global as any)[GLOBAL_CACHE_KEY] = cacheStore;
}

export const cacheService = {
  get: <T>(key: string): T | null => {
    const entry = cacheStore.get(key);
    if (!entry) return null;
    
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      cacheStore.delete(key);
      return null;
    }
    
    return entry.value as T;
  },

  set: (key: string, value: any, ttlSeconds?: number): void => {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    cacheStore.set(key, { value, expiresAt });
  },

  del: (key: string): void => {
    cacheStore.delete(key);
  },

  clear: (): void => {
    cacheStore.clear();
  },

  keys: (): string[] => {
    const activeKeys: string[] = [];
    const now = Date.now();
    cacheStore.forEach((entry, key) => {
      if (!entry.expiresAt || now <= entry.expiresAt) {
        activeKeys.push(key);
      } else {
        cacheStore.delete(key);
      }
    });
    return activeKeys;
  }
};
