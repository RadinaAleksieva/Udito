/**
 * Tests for Zod validation schemas
 */

import { describe, it, expect } from 'vitest';
import {
  eikSchema,
  vatNumberSchema,
  emailSchema,
  phoneSchema,
  ibanSchema,
  companyUpdateSchema,
  issueReceiptSchema,
  registerSchema,
  loginSchema,
  orderListSchema,
  validateOrThrow,
  validateSafe,
} from '@/lib/validation/schemas';
import { ValidationError } from '@/lib/errors';

describe('eikSchema', () => {
  it('should accept valid 9-digit EIK', () => {
    expect(() => eikSchema.parse('123456789')).not.toThrow();
  });

  it('should accept valid 13-digit EIK', () => {
    expect(() => eikSchema.parse('1234567890123')).not.toThrow();
  });

  it('should reject 8-digit number', () => {
    expect(() => eikSchema.parse('12345678')).toThrow();
  });

  it('should reject 10-digit number', () => {
    expect(() => eikSchema.parse('1234567890')).toThrow();
  });

  it('should reject letters', () => {
    expect(() => eikSchema.parse('12345678a')).toThrow();
  });

  it('should reject empty string', () => {
    expect(() => eikSchema.parse('')).toThrow();
  });
});

describe('vatNumberSchema', () => {
  it('should accept valid 9-digit VAT number', () => {
    expect(() => vatNumberSchema.parse('BG123456789')).not.toThrow();
  });

  it('should accept valid 10-digit VAT number', () => {
    expect(() => vatNumberSchema.parse('BG1234567890')).not.toThrow();
  });

  it('should accept null', () => {
    expect(vatNumberSchema.parse(null)).toBeNull();
  });

  it('should accept undefined', () => {
    expect(vatNumberSchema.parse(undefined)).toBeUndefined();
  });

  it('should reject without BG prefix', () => {
    expect(() => vatNumberSchema.parse('123456789')).toThrow();
  });

  it('should reject lowercase bg prefix', () => {
    expect(() => vatNumberSchema.parse('bg123456789')).toThrow();
  });
});

describe('emailSchema', () => {
  it('should accept valid email', () => {
    expect(() => emailSchema.parse('test@example.com')).not.toThrow();
  });

  it('should accept email with subdomain', () => {
    expect(() => emailSchema.parse('user@mail.example.com')).not.toThrow();
  });

  it('should reject invalid email', () => {
    expect(() => emailSchema.parse('not-an-email')).toThrow();
  });

  it('should reject email without domain', () => {
    expect(() => emailSchema.parse('test@')).toThrow();
  });
});

describe('phoneSchema', () => {
  it('should accept valid Bulgarian phone with +359', () => {
    expect(() => phoneSchema.parse('+359888123456')).not.toThrow();
  });

  it('should accept valid Bulgarian phone with 0', () => {
    expect(() => phoneSchema.parse('0888123456')).not.toThrow();
  });

  it('should accept null', () => {
    expect(phoneSchema.parse(null)).toBeNull();
  });

  it('should reject short phone number', () => {
    expect(() => phoneSchema.parse('088812345')).toThrow();
  });

  it('should reject non-Bulgarian phone', () => {
    expect(() => phoneSchema.parse('+1234567890')).toThrow();
  });
});

describe('ibanSchema', () => {
  it('should accept valid Bulgarian IBAN', () => {
    expect(() => ibanSchema.parse('BG80BNBG96611020345678')).not.toThrow();
  });

  it('should accept null', () => {
    expect(ibanSchema.parse(null)).toBeNull();
  });

  it('should reject non-Bulgarian IBAN', () => {
    expect(() => ibanSchema.parse('DE89370400440532013000')).toThrow();
  });

  it('should reject short IBAN', () => {
    expect(() => ibanSchema.parse('BG80BNBG9661102')).toThrow();
  });
});

describe('registerSchema', () => {
  it('should accept valid registration data', () => {
    const data = {
      email: 'test@example.com',
      password: 'SecurePass1',
      name: 'Test User',
    };
    expect(() => registerSchema.parse(data)).not.toThrow();
  });

  it('should reject password without uppercase', () => {
    const data = {
      email: 'test@example.com',
      password: 'securepass1',
    };
    expect(() => registerSchema.parse(data)).toThrow();
  });

  it('should reject password without lowercase', () => {
    const data = {
      email: 'test@example.com',
      password: 'SECUREPASS1',
    };
    expect(() => registerSchema.parse(data)).toThrow();
  });

  it('should reject password without number', () => {
    const data = {
      email: 'test@example.com',
      password: 'SecurePass',
    };
    expect(() => registerSchema.parse(data)).toThrow();
  });

  it('should reject short password', () => {
    const data = {
      email: 'test@example.com',
      password: 'Pass1',
    };
    expect(() => registerSchema.parse(data)).toThrow();
  });
});

describe('issueReceiptSchema', () => {
  it('should accept valid receipt request', () => {
    const data = {
      orderId: 'order-123',
      siteId: '6240f8a5-7af4-4fdf-96c1-d1f22b205408',
    };
    expect(() => issueReceiptSchema.parse(data)).not.toThrow();
  });

  it('should reject empty orderId', () => {
    const data = {
      orderId: '',
      siteId: 'abc-123',
    };
    expect(() => issueReceiptSchema.parse(data)).toThrow();
  });

  it('should reject missing siteId', () => {
    const data = {
      orderId: 'order-123',
    };
    expect(() => issueReceiptSchema.parse(data)).toThrow();
  });
});

describe('orderListSchema', () => {
  it('should accept valid query params', () => {
    const data = {
      limit: 50,
      offset: 0,
    };
    const result = orderListSchema.parse(data);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('should coerce string numbers', () => {
    const data = {
      limit: '100',
      offset: '25',
    };
    const result = orderListSchema.parse(data);
    expect(result.limit).toBe(100);
    expect(result.offset).toBe(25);
  });

  it('should use default values', () => {
    const result = orderListSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('should cap limit at 500', () => {
    expect(() => orderListSchema.parse({ limit: 1000 })).toThrow();
  });

  it('should reject negative offset', () => {
    expect(() => orderListSchema.parse({ offset: -1 })).toThrow();
  });

  it('should accept valid payment status', () => {
    const result = orderListSchema.parse({ paymentStatus: 'PAID' });
    expect(result.paymentStatus).toBe('PAID');
  });

  it('should reject invalid payment status', () => {
    expect(() => orderListSchema.parse({ paymentStatus: 'INVALID' })).toThrow();
  });
});

describe('validateOrThrow', () => {
  it('should return data for valid input', () => {
    const result = validateOrThrow(emailSchema, 'test@example.com');
    expect(result).toBe('test@example.com');
  });

  it('should throw ValidationError for invalid input', () => {
    expect(() => validateOrThrow(emailSchema, 'invalid')).toThrow(ValidationError);
  });

  it('should include field information in error', () => {
    try {
      validateOrThrow(registerSchema, { email: 'invalid', password: 'short' });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details?.errors).toBeDefined();
    }
  });
});

describe('validateSafe', () => {
  it('should return success for valid input', () => {
    const result = validateSafe(emailSchema, 'test@example.com');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('test@example.com');
    }
  });

  it('should return errors for invalid input', () => {
    const result = validateSafe(emailSchema, 'invalid');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('should not throw for invalid input', () => {
    expect(() => validateSafe(emailSchema, 'invalid')).not.toThrow();
  });
});
