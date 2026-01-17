/**
 * Tests for custom error classes
 */

import { describe, it, expect } from 'vitest';
import {
  UditoError,
  AuthenticationError,
  AuthorizationError,
  TenantNotFoundError,
  TenantAccessDeniedError,
  OrderNotFoundError,
  ReceiptNotFoundError,
  ReceiptAlreadyExistsError,
  ValidationError,
  RateLimitError,
  WixApiError,
  isUditoError,
  errorToResponse,
  getErrorStatusCode,
} from '@/lib/errors';

describe('UditoError', () => {
  it('should create error with all properties', () => {
    const error = new UditoError('Test message', 'TEST_ERROR', 400, { foo: 'bar' });

    expect(error.message).toBe('Test message');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual({ foo: 'bar' });
    expect(error.timestamp).toBeDefined();
  });

  it('should default statusCode to 500', () => {
    const error = new UditoError('Test', 'TEST');
    expect(error.statusCode).toBe(500);
  });

  it('should be instance of Error', () => {
    const error = new UditoError('Test', 'TEST');
    expect(error).toBeInstanceOf(Error);
  });

  it('should serialize to JSON correctly', () => {
    const error = new UditoError('Test', 'TEST', 400, { detail: 'value' });
    const json = error.toJSON();

    expect(json.error.message).toBe('Test');
    expect(json.error.code).toBe('TEST');
    expect(json.error.statusCode).toBe(400);
    expect(json.error.details).toEqual({ detail: 'value' });
    expect(json.error.timestamp).toBeDefined();
  });
});

describe('AuthenticationError', () => {
  it('should have correct defaults', () => {
    const error = new AuthenticationError();

    expect(error.message).toBe('Authentication required');
    expect(error.code).toBe('AUTH_REQUIRED');
    expect(error.statusCode).toBe(401);
  });

  it('should allow custom message', () => {
    const error = new AuthenticationError('Session expired');
    expect(error.message).toBe('Session expired');
  });
});

describe('AuthorizationError', () => {
  it('should have correct defaults', () => {
    const error = new AuthorizationError();

    expect(error.message).toBe('Permission denied');
    expect(error.code).toBe('PERMISSION_DENIED');
    expect(error.statusCode).toBe(403);
  });
});

describe('TenantNotFoundError', () => {
  it('should include siteId in message and details', () => {
    const error = new TenantNotFoundError('site-123');

    expect(error.message).toContain('site-123');
    expect(error.code).toBe('TENANT_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.details?.siteId).toBe('site-123');
  });
});

describe('TenantAccessDeniedError', () => {
  it('should include siteId and userId in details', () => {
    const error = new TenantAccessDeniedError('site-123', 'user-456');

    expect(error.code).toBe('TENANT_ACCESS_DENIED');
    expect(error.statusCode).toBe(403);
    expect(error.details?.siteId).toBe('site-123');
    expect(error.details?.userId).toBe('user-456');
  });
});

describe('OrderNotFoundError', () => {
  it('should include orderId in message and details', () => {
    const error = new OrderNotFoundError('order-123');

    expect(error.message).toContain('order-123');
    expect(error.code).toBe('ORDER_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.details?.orderId).toBe('order-123');
  });
});

describe('ReceiptNotFoundError', () => {
  it('should accept number receiptId', () => {
    const error = new ReceiptNotFoundError(123);

    expect(error.message).toContain('123');
    expect(error.statusCode).toBe(404);
    expect(error.details?.receiptId).toBe(123);
  });

  it('should accept string receiptId', () => {
    const error = new ReceiptNotFoundError('receipt-abc');

    expect(error.message).toContain('receipt-abc');
    expect(error.details?.receiptId).toBe('receipt-abc');
  });
});

describe('ReceiptAlreadyExistsError', () => {
  it('should have 409 Conflict status', () => {
    const error = new ReceiptAlreadyExistsError('order-123', 456);

    expect(error.code).toBe('RECEIPT_ALREADY_EXISTS');
    expect(error.statusCode).toBe(409);
    expect(error.details?.orderId).toBe('order-123');
    expect(error.details?.receiptId).toBe(456);
  });
});

describe('ValidationError', () => {
  it('should include field errors', () => {
    const errors = [
      { field: 'email', message: 'Invalid email' },
      { field: 'password', message: 'Too short' },
    ];
    const error = new ValidationError('Validation failed', errors);

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details?.errors).toEqual(errors);
  });
});

describe('RateLimitError', () => {
  it('should include limit and reset time', () => {
    const resetAt = new Date(Date.now() + 60000);
    const error = new RateLimitError(100, resetAt);

    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.statusCode).toBe(429);
    expect(error.details?.limit).toBe(100);
    expect(error.details?.resetAt).toBe(resetAt.toISOString());
    expect(error.details?.retryAfter).toBeGreaterThan(0);
  });
});

describe('WixApiError', () => {
  it('should wrap original error message', () => {
    const original = new Error('Connection timeout');
    const error = new WixApiError('Failed to fetch', original);

    expect(error.message).toContain('Wix API error');
    expect(error.message).toContain('Failed to fetch');
    expect(error.statusCode).toBe(502);
    expect(error.details?.originalError).toBe('Connection timeout');
  });
});

describe('isUditoError', () => {
  it('should return true for UditoError', () => {
    const error = new UditoError('Test', 'TEST');
    expect(isUditoError(error)).toBe(true);
  });

  it('should return true for subclasses', () => {
    expect(isUditoError(new AuthenticationError())).toBe(true);
    expect(isUditoError(new TenantNotFoundError('site'))).toBe(true);
    expect(isUditoError(new ValidationError('msg', []))).toBe(true);
  });

  it('should return false for regular Error', () => {
    expect(isUditoError(new Error('Test'))).toBe(false);
  });

  it('should return false for non-errors', () => {
    expect(isUditoError('string')).toBe(false);
    expect(isUditoError(null)).toBe(false);
    expect(isUditoError(undefined)).toBe(false);
    expect(isUditoError({})).toBe(false);
  });
});

describe('errorToResponse', () => {
  it('should convert UditoError to JSON response', () => {
    const error = new AuthenticationError('Token expired');
    const response = errorToResponse(error);

    expect(response.error.code).toBe('AUTH_REQUIRED');
    expect(response.error.message).toBe('Token expired');
    expect(response.error.statusCode).toBe(401);
  });

  it('should convert generic Error to safe response', () => {
    const error = new Error('Something went wrong');
    const response = errorToResponse(error);

    expect(response.error.code).toBe('INTERNAL_ERROR');
    expect(response.error.statusCode).toBe(500);
  });

  it('should handle non-Error objects', () => {
    const response = errorToResponse('string error');

    expect(response.error.code).toBe('INTERNAL_ERROR');
    expect(response.error.statusCode).toBe(500);
  });
});

describe('getErrorStatusCode', () => {
  it('should return status code for UditoError', () => {
    expect(getErrorStatusCode(new AuthenticationError())).toBe(401);
    expect(getErrorStatusCode(new AuthorizationError())).toBe(403);
    expect(getErrorStatusCode(new TenantNotFoundError('site'))).toBe(404);
    expect(getErrorStatusCode(new ValidationError('msg', []))).toBe(400);
    expect(getErrorStatusCode(new RateLimitError(100, new Date()))).toBe(429);
  });

  it('should return 500 for generic errors', () => {
    expect(getErrorStatusCode(new Error('Test'))).toBe(500);
    expect(getErrorStatusCode('string')).toBe(500);
    expect(getErrorStatusCode(null)).toBe(500);
  });
});
