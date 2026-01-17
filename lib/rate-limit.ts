/**
 * Rate limiting module
 *
 * Provides rate limiting for API endpoints with support for:
 * - In-memory rate limiting (development)
 * - Redis-based rate limiting via Upstash (production)
 *
 * Usage:
 *   const limiter = createRateLimiter({ requests: 100, window: '1m' });
 *   const { success, remaining } = await limiter.check(identifier);
 */

import { RateLimitError } from './errors';
import { logger } from './logger';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  requests: number;
  /** Time window (e.g., '1m', '1h', '1d') */
  window: string;
  /** Optional prefix for keys */
  prefix?: string;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  success: boolean;
  /** Number of remaining requests in the window */
  remaining: number;
  /** When the limit resets (Unix timestamp in seconds) */
  reset: number;
  /** Total limit */
  limit: number;
}

export interface RateLimiter {
  check(identifier: string): Promise<RateLimitResult>;
}

// ============================================================================
// Window parsing
// ============================================================================

function parseWindow(window: string): number {
  const match = window.match(/^(\d+)(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid window format: ${window}. Use format like '1m', '10s', '1h', '1d'`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

// ============================================================================
// In-Memory Rate Limiter (Development)
// ============================================================================

interface MemoryEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, MemoryEntry>();

// Cleanup old entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
      if (entry.resetAt < now) {
        memoryStore.delete(key);
      }
    }
  }, 60000); // Cleanup every minute
}

function createMemoryRateLimiter(config: RateLimitConfig): RateLimiter {
  const windowMs = parseWindow(config.window);
  const prefix = config.prefix || 'ratelimit';

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      const key = `${prefix}:${identifier}`;
      const now = Date.now();

      let entry = memoryStore.get(key);

      // If no entry or expired, create new one
      if (!entry || entry.resetAt < now) {
        entry = {
          count: 0,
          resetAt: now + windowMs,
        };
      }

      entry.count++;
      memoryStore.set(key, entry);

      const remaining = Math.max(0, config.requests - entry.count);
      const reset = Math.ceil(entry.resetAt / 1000);
      const success = entry.count <= config.requests;

      return {
        success,
        remaining,
        reset,
        limit: config.requests,
      };
    },
  };
}

// ============================================================================
// Upstash Redis Rate Limiter (Production)
// ============================================================================

async function createUpstashRateLimiter(config: RateLimitConfig): Promise<RateLimiter> {
  const windowMs = parseWindow(config.window);
  const windowSeconds = Math.ceil(windowMs / 1000);
  const prefix = config.prefix || 'ratelimit';

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.warn('Upstash Redis not configured, falling back to memory rate limiting');
    return createMemoryRateLimiter(config);
  }

  return {
    async check(identifier: string): Promise<RateLimitResult> {
      const key = `${prefix}:${identifier}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      try {
        // Use sliding window algorithm with sorted set
        // ZREMRANGEBYSCORE removes old entries
        // ZADD adds current request
        // ZCOUNT counts requests in window
        // EXPIRE sets TTL

        const pipeline = [
          ['ZREMRANGEBYSCORE', key, '0', windowStart.toString()],
          ['ZADD', key, now.toString(), `${now}:${Math.random()}`],
          ['ZCOUNT', key, windowStart.toString(), '+inf'],
          ['EXPIRE', key, windowSeconds.toString()],
        ];

        const response = await fetch(`${url}/pipeline`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pipeline),
        });

        if (!response.ok) {
          throw new Error(`Upstash request failed: ${response.status}`);
        }

        const results = await response.json();
        const count = results[2]?.result || 0;

        const remaining = Math.max(0, config.requests - count);
        const reset = Math.ceil((now + windowMs) / 1000);
        const success = count <= config.requests;

        return {
          success,
          remaining,
          reset,
          limit: config.requests,
        };
      } catch (error) {
        logger.error({ error }, 'Rate limit check failed, allowing request');
        // On error, allow the request (fail open)
        return {
          success: true,
          remaining: config.requests,
          reset: Math.ceil((now + windowMs) / 1000),
          limit: config.requests,
        };
      }
    },
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a rate limiter based on environment
 * Uses Upstash Redis in production, memory in development
 */
export async function createRateLimiter(config: RateLimitConfig): Promise<RateLimiter> {
  const hasUpstash =
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

  if (hasUpstash && process.env.NODE_ENV === 'production') {
    return createUpstashRateLimiter(config);
  }

  return createMemoryRateLimiter(config);
}

/**
 * Synchronous factory for memory-only rate limiting
 * Use this when you don't have access to async context
 */
export function createMemoryLimiter(config: RateLimitConfig): RateLimiter {
  return createMemoryRateLimiter(config);
}

// ============================================================================
// Pre-configured Limiters
// ============================================================================

/** Rate limiter for API endpoints: 100 requests per minute */
export const apiLimiter = createMemoryLimiter({
  requests: 100,
  window: '1m',
  prefix: 'api',
});

/** Rate limiter for authentication: 10 attempts per minute */
export const authLimiter = createMemoryLimiter({
  requests: 10,
  window: '1m',
  prefix: 'auth',
});

/** Rate limiter for webhooks: 1000 requests per minute per tenant */
export const webhookLimiter = createMemoryLimiter({
  requests: 1000,
  window: '1m',
  prefix: 'webhook',
});

/** Rate limiter for receipt issuance: 50 per minute per tenant */
export const receiptLimiter = createMemoryLimiter({
  requests: 50,
  window: '1m',
  prefix: 'receipt',
});

// ============================================================================
// Middleware Helper
// ============================================================================

/**
 * Check rate limit and throw RateLimitError if exceeded
 */
export async function checkRateLimit(
  limiter: RateLimiter,
  identifier: string
): Promise<RateLimitResult> {
  const result = await limiter.check(identifier);

  if (!result.success) {
    const resetAt = new Date(result.reset * 1000);
    throw new RateLimitError(result.limit, resetAt);
  }

  return result;
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  };
}
