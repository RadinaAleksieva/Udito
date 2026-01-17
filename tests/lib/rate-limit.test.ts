/**
 * Tests for rate limiting module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMemoryLimiter,
  checkRateLimit,
  getRateLimitHeaders,
} from '@/lib/rate-limit';
import { RateLimitError } from '@/lib/errors';

describe('createMemoryLimiter', () => {
  it('should allow requests within limit', async () => {
    const limiter = createMemoryLimiter({
      requests: 5,
      window: '1m',
      prefix: 'test-allow',
    });

    const result = await limiter.check('user-1');

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.limit).toBe(5);
    expect(result.reset).toBeGreaterThan(Date.now() / 1000);
  });

  it('should block requests exceeding limit', async () => {
    const limiter = createMemoryLimiter({
      requests: 3,
      window: '1m',
      prefix: 'test-block',
    });

    // Make 3 requests (should all succeed)
    await limiter.check('user-2');
    await limiter.check('user-2');
    await limiter.check('user-2');

    // 4th request should fail
    const result = await limiter.check('user-2');

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should track different identifiers separately', async () => {
    const limiter = createMemoryLimiter({
      requests: 2,
      window: '1m',
      prefix: 'test-separate',
    });

    // User A makes 2 requests
    await limiter.check('user-a');
    await limiter.check('user-a');

    // User B should still have full quota
    const resultB = await limiter.check('user-b');
    expect(resultB.success).toBe(true);
    expect(resultB.remaining).toBe(1);

    // User A should be blocked
    const resultA = await limiter.check('user-a');
    expect(resultA.success).toBe(false);
  });

  it('should decrement remaining correctly', async () => {
    const limiter = createMemoryLimiter({
      requests: 5,
      window: '1m',
      prefix: 'test-decrement',
    });

    const r1 = await limiter.check('user-3');
    expect(r1.remaining).toBe(4);

    const r2 = await limiter.check('user-3');
    expect(r2.remaining).toBe(3);

    const r3 = await limiter.check('user-3');
    expect(r3.remaining).toBe(2);
  });

  it('should support different window formats', () => {
    // These should not throw
    expect(() =>
      createMemoryLimiter({ requests: 10, window: '10s', prefix: 't1' })
    ).not.toThrow();
    expect(() =>
      createMemoryLimiter({ requests: 10, window: '5m', prefix: 't2' })
    ).not.toThrow();
    expect(() =>
      createMemoryLimiter({ requests: 10, window: '1h', prefix: 't3' })
    ).not.toThrow();
    expect(() =>
      createMemoryLimiter({ requests: 10, window: '1d', prefix: 't4' })
    ).not.toThrow();
  });

  it('should throw for invalid window format', () => {
    // The error happens at creation time when parsing the window
    expect(() =>
      createMemoryLimiter({
        requests: 10,
        window: 'invalid',
        prefix: 'test-invalid',
      })
    ).toThrow('Invalid window format');
  });
});

describe('checkRateLimit', () => {
  it('should return result when within limit', async () => {
    const limiter = createMemoryLimiter({
      requests: 5,
      window: '1m',
      prefix: 'test-check-ok',
    });

    const result = await checkRateLimit(limiter, 'user-ok');

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('should throw RateLimitError when limit exceeded', async () => {
    const limiter = createMemoryLimiter({
      requests: 1,
      window: '1m',
      prefix: 'test-check-fail',
    });

    // First request succeeds
    await checkRateLimit(limiter, 'user-fail');

    // Second request should throw
    await expect(checkRateLimit(limiter, 'user-fail')).rejects.toThrow(
      RateLimitError
    );
  });

  it('should include limit and reset time in error', async () => {
    const limiter = createMemoryLimiter({
      requests: 1,
      window: '1m',
      prefix: 'test-check-error',
    });

    await checkRateLimit(limiter, 'user-error');

    try {
      await checkRateLimit(limiter, 'user-error');
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      const rateLimitError = error as RateLimitError;
      expect(rateLimitError.statusCode).toBe(429);
      expect(rateLimitError.details?.limit).toBe(1);
      expect(rateLimitError.details?.resetAt).toBeDefined();
    }
  });
});

describe('getRateLimitHeaders', () => {
  it('should return correct headers', () => {
    const result = {
      success: true,
      remaining: 95,
      reset: 1704067200,
      limit: 100,
    };

    const headers = getRateLimitHeaders(result);

    expect(headers['X-RateLimit-Limit']).toBe('100');
    expect(headers['X-RateLimit-Remaining']).toBe('95');
    expect(headers['X-RateLimit-Reset']).toBe('1704067200');
  });

  it('should handle zero remaining', () => {
    const result = {
      success: false,
      remaining: 0,
      reset: 1704067200,
      limit: 50,
    };

    const headers = getRateLimitHeaders(result);

    expect(headers['X-RateLimit-Remaining']).toBe('0');
  });
});
