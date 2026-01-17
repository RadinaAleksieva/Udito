/**
 * Environment configuration with validation
 *
 * All environment variables should be accessed through this module.
 * Validates required variables at startup and provides typed access.
 */

import { z } from 'zod';
import { logger } from './logger';

// ============================================================================
// Schema Definitions
// ============================================================================

const configSchema = z.object({
  // Database
  POSTGRES_URL: z.string().min(1, 'POSTGRES_URL is required'),

  // NextAuth
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),

  // Wix App
  WIX_APP_ID: z.string().min(1, 'WIX_APP_ID is required'),
  WIX_APP_SECRET: z.string().min(1, 'WIX_APP_SECRET is required'),
  WIX_APP_PUBLIC_KEY: z.string().min(1, 'WIX_APP_PUBLIC_KEY is required'),

  // Optional: Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Optional: Rate limiting (Upstash)
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  // Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),

  // App settings
  APP_URL: z.string().url().optional(),
});

// ============================================================================
// Config Type
// ============================================================================

export type Config = z.infer<typeof configSchema>;

// ============================================================================
// Validation and Export
// ============================================================================

let _config: Config | null = null;

/**
 * Validate and load configuration from environment
 * Call this at application startup
 */
export function loadConfig(): Config {
  if (_config) {
    return _config;
  }

  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    // Zod v4 uses 'issues' instead of 'errors'
    // eslint-disable-next-line
    const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
    // eslint-disable-next-line
    const errors = issues.map((e: any) => `  - ${e.path?.join?.('.') ?? ''}: ${e.message ?? 'Unknown'}`);
    const message = `Configuration validation failed:\n${errors.join('\n')}`;

    // In production, log and exit
    if (process.env.NODE_ENV === 'production') {
      logger.fatal({ errors: issues }, 'Configuration validation failed');
      console.error(message);
      process.exit(1);
    }

    // In development/test, throw error
    throw new Error(message);
  }

  _config = result.data;
  return _config;
}

/**
 * Get loaded configuration
 * Throws if config hasn't been loaded
 */
export function getConfig(): Config {
  if (!_config) {
    return loadConfig();
  }
  return _config;
}

/**
 * Check if a feature is enabled based on config
 */
export const features = {
  get hasStripe(): boolean {
    const config = getConfig();
    return !!config.STRIPE_SECRET_KEY && !!config.STRIPE_WEBHOOK_SECRET;
  },

  get hasRateLimiting(): boolean {
    const config = getConfig();
    return !!config.UPSTASH_REDIS_REST_URL && !!config.UPSTASH_REDIS_REST_TOKEN;
  },

  get isProduction(): boolean {
    return getConfig().NODE_ENV === 'production';
  },

  get isDevelopment(): boolean {
    return getConfig().NODE_ENV === 'development';
  },

  get isTest(): boolean {
    return getConfig().NODE_ENV === 'test';
  },
};

// ============================================================================
// Environment-specific defaults
// ============================================================================

/**
 * Get base URL for the application
 */
export function getAppUrl(): string {
  const config = getConfig();
  return config.APP_URL || config.NEXTAUTH_URL;
}

/**
 * Get database connection string
 */
export function getDatabaseUrl(): string {
  return getConfig().POSTGRES_URL;
}

// ============================================================================
// Validation at import time (development only)
// ============================================================================

// In development, validate config on import to catch errors early
if (process.env.NODE_ENV === 'development') {
  try {
    loadConfig();
  } catch {
    // Silently ignore in development - will be caught when config is used
  }
}
