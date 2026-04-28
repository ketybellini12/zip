import { Redis } from 'ioredis';
import { getEnv, isProduction } from './env';
import { logger } from './logger';

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  
  const env = getEnv();
  if (!env.REDIS_URL) {
    if (isProduction()) {
      logger.warn('REDIS_URL not set - caching disabled in production');
    }
    return null;
  }
  
  try {
    redisClient = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
    
    redisClient.on('error', (err) => {
      logger.error('Redis connection error', err);
    });
    
    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });
    
    return redisClient;
  } catch (error) {
    logger.error('Failed to initialize Redis', error as Error);
    return null;
  }
}

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
  serialize?: boolean;
}

export class Cache {
  private client: Redis | null;
  private defaultTtl: number;
  private namespace: string;
  
  constructor(options: CacheOptions = {}) {
    this.client = getRedisClient();
    this.defaultTtl = options.ttl || 300; // 5 minutes default
    this.namespace = options.namespace || 'app';
  }
  
  private key(k: string): string {
    return `${this.namespace}:${k}`;
  }
  
  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    
    try {
      const value = await this.client.get(this.key(key));
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache get error', error as Error, { key });
      return null;
    }
  }
  
  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<boolean> {
    if (!this.client) return false;
    
    try {
      const ttl = options?.ttl ?? this.defaultTtl;
      const serialized = JSON.stringify(value);
      await this.client.setex(this.key(key), ttl, serialized);
      return true;
    } catch (error) {
      logger.error('Cache set error', error as Error, { key });
      return false;
    }
  }
  
  async delete(key: string): Promise<boolean> {
    if (!this.client) return false;
    
    try {
      await this.client.del(this.key(key));
      return true;
    } catch (error) {
      logger.error('Cache delete error', error as Error, { key });
      return false;
    }
  }
  
  async invalidate(pattern: string): Promise<number> {
    if (!this.client) return 0;
    
    try {
      const keys = await this.client.keys(this.key(pattern));
      if (keys.length === 0) return 0;
      return await this.client.del(...keys);
    } catch (error) {
      logger.error('Cache invalidate error', error as Error, { pattern });
      return 0;
    }
  }
  
  // Decorator-friendly wrapper for caching async functions
  wrap<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options: { 
      key: (...args: Parameters<T>) => string;
      ttl?: number;
      skip?: (...args: Parameters<T>) => boolean;
    }
  ): T {
    return (async (...args: Parameters<T>) => {
      if (options.skip?.(...args)) {
        return fn(...args);
      }
      
      const cacheKey = options.key(...args);
      const cached = await this.get<ReturnType<T>>(cacheKey);
      
      if (cached !== null) {
        return cached;
      }
      
      const result = await fn(...args);
      await this.set(cacheKey, result, { ttl: options.ttl });
      return result;
    }) as T;
  }
}

// Default cache instance
export const cache = new Cache();

// Pre-configured caches for common use cases
export const caches = {
  user: new Cache({ namespace: 'user', ttl: 900 }), // 15 minutes
  thread: new Cache({ namespace: 'thread', ttl: 300 }), // 5 minutes
  model: new Cache({ namespace: 'model', ttl: 3600 }), // 1 hour
  billing: new Cache({ namespace: 'billing', ttl: 60 }), // 1 minute
};

export default cache;