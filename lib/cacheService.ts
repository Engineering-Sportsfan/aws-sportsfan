import { Redis } from '@upstash/redis';

// 1. Initialize Upstash ONLY if the developer has put the keys in their .env file.
// If they are missing (like Chandu's laptop today), this safely stays null.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
const redisClient = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;

// 2. The Safe Fallback (In-Memory Cache)
// This guarantees that if a teammate doesn't have the Upstash keys, their laptop still works 100%.
interface CacheEntry {
  value: any;
  expiresAt: number | null;
}

const GLOBAL_CACHE_KEY = Symbol.for("sportsfan.inmemory.cache");
const fallbackCache: Map<string, CacheEntry> = (global as any)[GLOBAL_CACHE_KEY] || new Map<string, CacheEntry>();

if (process.env.NODE_ENV !== "production") {
  (global as any)[GLOBAL_CACHE_KEY] = fallbackCache;
}

export const cacheService = {
  get: async <T>(key: string): Promise<T | null> => {
    try {
      // A. Try the Cloud (Upstash) First
      if (redisClient) {
        return await redisClient.get<T>(key);
      }
      
      // B. Fallback for Teammates without .env keys
      const entry = fallbackCache.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        fallbackCache.delete(key);
        return null;
      }
      return entry.value as T;
    } catch (error) {
      console.error(`[Cache GET Error for ${key}]:`, error);
      return null; // Bulletproof: If Redis hiccups, don't crash the API. Just return null and fetch fresh data.
    }
  },

  set: async (key: string, value: any, ttlSeconds?: number): Promise<void> => {
    try {
      // A. Try the Cloud (Upstash) First
      if (redisClient) {
        if (ttlSeconds) {
          await redisClient.set(key, value, { ex: ttlSeconds });
        } else {
          await redisClient.set(key, value);
        }
        return;
      }
      
      // B. Fallback for Teammates without .env keys
      const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
      fallbackCache.set(key, { value, expiresAt });
    } catch (error) {
      console.error(`[Cache SET Error for ${key}]:`, error);
      // Bulletproof: Catch errors so the frontend doesn't crash if save fails.
    }
  },

  del: async (key: string): Promise<void> => {
    try {
      if (redisClient) {
        await redisClient.del(key);
        return;
      }
      fallbackCache.delete(key);
    } catch (error) {
      console.error(`[Cache DEL Error for ${key}]:`, error);
    }
  },

  clear: async (): Promise<void> => {
    try {
      if (redisClient) {
        await redisClient.flushdb();
        return;
      }
      fallbackCache.clear();
    } catch (error) {
      console.error(`[Cache CLEAR Error]:`, error);
    }
  }
};
