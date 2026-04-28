import { Redis } from 'ioredis';
import { logger } from './logger';

interface RateLimitConfig {
  points: number;      // Number of requests allowed
  duration: number;    // Duration in seconds
  blockDuration?: number; // Block duration in seconds (0 = no block)
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export class RateLimiter {
  private client: Redis | null = null;
  private prefix: string;
  
  constructor(
    redisUrl?: string,
    prefix: string = 'ratelimit'
  ) {
    this.prefix = prefix;
    
    if (redisUrl) {
      try {
        this.client = new Redis(redisUrl, {
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          lazyConnect: true,
        });
        
        this.client.on('error', (err) => {
          logger.error('Rate limiter Redis error', err);
        });
      } catch (error) {
        logger.warn('Rate limiter running in memory mode (Redis unavailable)');
      }
    }
  }

  private async consume(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    if (this.client) {
      return this.consumeRedis(key, config);
    }
    return this.consumeMemory(key, config);
  }

  private async consumeRedis(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const fullKey = `${this.prefix}:${key}`;
    const now = Date.now();
    const window = config.duration * 1000;
    
    try {
      // Use Lua script for atomic operation
      const script = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local maxPoints = tonumber(ARGV[3])
        local blockDuration = tonumber(ARGV[4])
        
        -- Clean old entries
        redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
        
        -- Check current count
        local count = redis.call('ZCARD', key)
        
        if count >= maxPoints then
          -- Get oldest entry time for retry-after
          local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
          local resetAt = tonumber(oldest[2]) + window
          
          return {0, maxPoints - count, resetAt}
        end
        
        -- Add current request
        redis.call('ZADD', key, now, tostring(now) .. ':' .. tostring(math.random()))
        redis.call('EXPIRE', key, math.ceil(window / 1000) + blockDuration)
        
        local resetAt = now + window
        return {1, maxPoints - count - 1, resetAt}
      `;
      
      const result = await this.client.eval(
        script,
        1,
        fullKey,
        now,
        window,
        config.points,
        config.blockDuration || 0
      ) as [number, number, number];
      
      return {
        allowed: result[0] === 1,
        remaining: result[1],
        resetAt: new Date(result[2]),
        retryAfter: result[0] === 0 ? Math.ceil((result[2] - now) / 1000) : undefined,
      };
    } catch (error) {
      logger.error('Redis rate limiter error', error as Error);
      // Fall back to allowing request
      return { allowed: true, remaining: 1, resetAt: new Date(Date.now() + window) };
    }
  }

  // In-memory fallback (not distributed-safe)
  private memoryStore = new Map<string, { timestamps: number[]; blockedUntil?: number }>();

  private async consumeMemory(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const fullKey = `${this.prefix}:${key}`;
    const now = Date.now();
    const window = config.duration * 1000;
    
    let record = this.memoryStore.get(fullKey);
    
    // Check if currently blocked
    if (record?.blockedUntil && now < record.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(record.blockedUntil),
        retryAfter: Math.ceil((record.blockedUntil - now) / 1000),
      };
    }
    
    // Clean old timestamps
    if (record) {
      record.timestamps = record.timestamps.filter(t => now - t < window);
    } else {
      record = { timestamps: [] };
      this.memoryStore.set(fullKey, record);
    }
    
    if (record.timestamps.length >= config.points) {
      const oldest = record.timestamps[0];
      const resetAt = oldest + window;
      
      // Block if configured
      if (config.blockDuration) {
        record.blockedUntil = now + (config.blockDuration * 1000);
      }
      
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(resetAt),
        retryAfter: Math.ceil((resetAt - now) / 1000),
      };
    }
    
    record.timestamps.push(now);
    
    // Clean up old records periodically
    if (this.memoryStore.size > 10000) {
      const cutoff = now - 3600000; // 1 hour
      for (const [k, v] of this.memoryStore) {
        if (v.timestamps.every(t => now - t > cutoff)) {
          this.memoryStore.delete(k);
        }
      }
    }
    
    return {
      allowed: true,
      remaining: config.points - record.timestamps.length,
      resetAt: new Date(now + window),
    };
  }

  // Convenience methods for common use cases
  async checkLogin(email: string): Promise<RateLimitResult> {
    return this.consume(`login:${email}`, {
      points: 5,
      duration: 900, // 15 minutes
      blockDuration: 300, // 5 minute block
    });
  }

  async checkSignup(ip: string): Promise<RateLimitResult> {
    return this.consume(`signup:${ip}`, {
      points: 3,
      duration: 3600, // 1 hour
      blockDuration: 3600, // 1 hour block
    });
  }

  async checkApi(key: string): Promise<RateLimitResult> {
    return this.consume(`api:${key}`, {
      points: 100,
      duration: 60, // 1 minute
    });
  }

  async checkAdmin(adminId: string): Promise<RateLimitResult> {
    return this.consume(`admin:${adminId}`, {
      points: 30,
      duration: 60, // 1 minute
    });
  }

  async checkGeneration(userId: string): Promise<RateLimitResult> {
    return this.consume(`gen:${userId}`, {
      points: 10,
      duration: 60, // 1 minute
    });
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter(
  process.env.REDIS_URL,
  'ratelimit:v1'
);

export default rateLimiter;