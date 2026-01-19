/**
 * Tests for tenant-db helper functions and database operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  normalizeSiteId,
  getTableName,
  TENANT_TABLES,
} from '@/lib/tenant-db';

// Mock @/lib/sql
vi.mock('@/lib/sql', () => ({
  sql: {
    query: vi.fn(),
  },
  pool: { query: vi.fn() },
}));

describe('normalizeSiteId', () => {
  it('should replace hyphens with underscores', () => {
    expect(normalizeSiteId('abc-def-123')).toBe('abc_def_123');
  });

  it('should remove special characters', () => {
    expect(normalizeSiteId('abc!@#$%^&*()')).toBe('abc');
  });

  it('should handle UUID format', () => {
    const uuid = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
    const normalized = normalizeSiteId(uuid);
    expect(normalized).toBe('6240f8a5_7af4_4fdf_96c1_d1f22b205408');
    expect(normalized).not.toContain('-');
  });

  it('should preserve alphanumeric characters', () => {
    expect(normalizeSiteId('abc123XYZ')).toBe('abc123XYZ');
  });

  it('should handle empty string', () => {
    expect(normalizeSiteId('')).toBe('');
  });

  it('should handle string with only special characters', () => {
    expect(normalizeSiteId('!@#$%')).toBe('');
  });

  it('should not allow SQL injection characters', () => {
    const malicious = "'; DROP TABLE users; --";
    const normalized = normalizeSiteId(malicious);
    expect(normalized).not.toContain("'");
    expect(normalized).not.toContain(';');
    expect(normalized).not.toContain(' ');
    expect(normalized).not.toContain('-');
  });
});

describe('getTableName', () => {
  it('should combine base name with normalized site ID', () => {
    expect(getTableName('orders', '123-456')).toBe('orders_123_456');
  });

  it('should handle different base names', () => {
    const siteId = 'abc-123';
    expect(getTableName('receipts', siteId)).toBe('receipts_abc_123');
    expect(getTableName('users', siteId)).toBe('users_abc_123');
    expect(getTableName('webhook_logs', siteId)).toBe('webhook_logs_abc_123');
  });

  it('should handle UUID site IDs', () => {
    const uuid = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
    expect(getTableName('orders', uuid)).toBe('orders_6240f8a5_7af4_4fdf_96c1_d1f22b205408');
  });
});

describe('TENANT_TABLES', () => {
  it('should contain all required tenant table types', () => {
    expect(TENANT_TABLES).toContain('orders');
    expect(TENANT_TABLES).toContain('receipts');
    expect(TENANT_TABLES).toContain('users');
    expect(TENANT_TABLES).toContain('webhook_logs');
    expect(TENANT_TABLES).toContain('sync_state');
    expect(TENANT_TABLES).toContain('monthly_usage');
    expect(TENANT_TABLES).toContain('pending_refunds');
  });

  it('should have exactly 7 table types', () => {
    expect(TENANT_TABLES.length).toBe(7);
  });
});

describe('Tenant isolation', () => {
  it('should generate unique table names for different tenants', () => {
    const site1 = '11111111-1111-1111-1111-111111111111';
    const site2 = '22222222-2222-2222-2222-222222222222';

    const table1 = getTableName('orders', site1);
    const table2 = getTableName('orders', site2);

    expect(table1).not.toBe(table2);
    expect(table1).toContain('11111111');
    expect(table2).toContain('22222222');
  });

  it('should neutralize SQL injection vectors', () => {
    // A malicious siteId should have SQL injection characters removed
    const maliciousSite = "abc'; DROP TABLE orders; --";

    const maliciousTable = getTableName('orders', maliciousSite);

    // The malicious input should have SQL injection characters removed
    expect(maliciousTable).not.toContain("'");
    expect(maliciousTable).not.toContain(';');
    expect(maliciousTable).not.toContain(' ');
    expect(maliciousTable).not.toContain('-');

    // The table name should be safely normalized
    // The '--' becomes '__' (hyphens become underscores)
    expect(maliciousTable).toBe('orders_abcDROPTABLEorders__');
  });

  it('should prevent cross-tenant access through naming', () => {
    // Different siteIds should produce different table names
    const site1 = 'tenant-a';
    const site2 = 'tenant-b';

    const table1 = getTableName('orders', site1);
    const table2 = getTableName('orders', site2);

    expect(table1).toBe('orders_tenant_a');
    expect(table2).toBe('orders_tenant_b');
    expect(table1).not.toBe(table2);
  });
});
