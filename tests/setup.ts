/**
 * Vitest setup file
 * Runs before all tests
 */

import { vi } from 'vitest';

// Mock environment variables for tests
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.NEXTAUTH_SECRET = 'test-secret-at-least-32-characters-long';
process.env.NEXTAUTH_URL = 'http://localhost:3000';
process.env.WIX_APP_ID = 'test-wix-app-id';
process.env.WIX_APP_SECRET = 'test-wix-app-secret';
process.env.WIX_APP_PUBLIC_KEY = 'test-wix-public-key';
// @ts-expect-error - NODE_ENV is normally read-only but we need to set it for tests
process.env.NODE_ENV = 'test';

// Mock @/lib/sql
vi.mock('@/lib/sql', () => ({
  sql: vi.fn(),
  pool: { query: vi.fn() },
}));

// Global test utilities
declare global {
  var testSiteId: string;
  var testOrderId: string;
}

globalThis.testSiteId = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
globalThis.testOrderId = 'test-order-123';
