/**
 * Redis Client Configuration
 * 
 * Provides a shared Redis connection for caching across the application.
 * Falls back to in-memory caching if Redis is not available.
 */

import Redis from 'ioredis';

let redisClient: Redis | null = null;
let isRedisAvailable = false;

// In-memory fallback cache when Redis is unavailable
const memoryCache = new Map<string, { data: string; expires: number }>();

export function initRedisClient(): Redis | null {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.log('[REDIS] No REDIS_URL configured, using in-memory cache fallback');
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('[REDIS] Max retries exceeded, falling back to memory cache');
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      connectTimeout: 5000,
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      console.log('[REDIS] Connected successfully');
      isRedisAvailable = true;
    });

    redisClient.on('error', (err) => {
      console.error('[REDIS] Connection error:', err.message);
      isRedisAvailable = false;
    });

    redisClient.on('close', () => {
      console.log('[REDIS] Connection closed');
      isRedisAvailable = false;
    });

    // Attempt connection
    redisClient.connect().catch((err) => {
      console.warn('[REDIS] Initial connection failed:', err.message);
      isRedisAvailable = false;
    });

    return redisClient;
  } catch (error) {
    console.error('[REDIS] Failed to initialize:', error);
    return null;
  }
}

export function getRedisClient(): Redis | null {
  return redisClient;
}

export function isRedisConnected(): boolean {
  return isRedisAvailable && redisClient !== null;
}

/**
 * Get value from cache (Redis or memory fallback)
 */
export async function cacheGet(key: string): Promise<string | null> {
  if (isRedisConnected() && redisClient) {
    try {
      return await redisClient.get(key);
    } catch (error) {
      console.warn('[REDIS] GET failed, using memory fallback:', (error as Error).message);
    }
  }
  
  // Memory fallback
  const cached = memoryCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  memoryCache.delete(key);
  return null;
}

/**
 * Set value in cache with TTL (Redis or memory fallback)
 */
export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  if (isRedisConnected() && redisClient) {
    try {
      await redisClient.setex(key, ttlSeconds, value);
      return;
    } catch (error) {
      console.warn('[REDIS] SET failed, using memory fallback:', (error as Error).message);
    }
  }
  
  // Memory fallback
  memoryCache.set(key, {
    data: value,
    expires: Date.now() + (ttlSeconds * 1000),
  });
  
  // Clean up expired entries periodically (keep memory under control)
  if (memoryCache.size > 1000) {
    const now = Date.now();
    const entries = Array.from(memoryCache.entries());
    for (const [k, v] of entries) {
      if (v.expires < now) {
        memoryCache.delete(k);
      }
    }
  }
}

/**
 * Delete key from cache
 */
export async function cacheDel(key: string): Promise<void> {
  if (isRedisConnected() && redisClient) {
    try {
      await redisClient.del(key);
    } catch (error) {
      console.warn('[REDIS] DEL failed:', (error as Error).message);
    }
  }
  memoryCache.delete(key);
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  type: 'redis' | 'memory';
  connected: boolean;
  keys?: number;
  memoryUsage?: string;
}> {
  if (isRedisConnected() && redisClient) {
    try {
      const info = await redisClient.info('memory');
      const dbSize = await redisClient.dbsize();
      const usedMemory = info.match(/used_memory_human:([^\r\n]+)/)?.[1] || 'unknown';
      
      return {
        type: 'redis',
        connected: true,
        keys: dbSize,
        memoryUsage: usedMemory,
      };
    } catch (error) {
      console.warn('[REDIS] Stats failed:', (error as Error).message);
    }
  }
  
  return {
    type: 'memory',
    connected: false,
    keys: memoryCache.size,
  };
}

// Initialize on module load
initRedisClient();
