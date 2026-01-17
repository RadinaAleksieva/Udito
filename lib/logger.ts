/**
 * Structured logging with pino
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info({ orderId, siteId }, 'Order processed');
 *   logger.error({ err, orderId }, 'Failed to process order');
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// Base logger configuration
const baseConfig: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),

  // Add timestamp
  timestamp: pino.stdTimeFunctions.isoTime,

  // Format log level as string
  formatters: {
    level: (label) => ({ level: label }),
  },

  // Redact sensitive fields
  redact: {
    paths: [
      'password',
      'passwordHash',
      'accessToken',
      'refreshToken',
      'token',
      'secret',
      'apiKey',
      'authorization',
      'cookie',
    ],
    censor: '[REDACTED]',
  },
};

// Development: pretty print
const devConfig: pino.LoggerOptions = {
  ...baseConfig,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  },
};

// Test: silent or minimal
const testConfig: pino.LoggerOptions = {
  ...baseConfig,
  level: 'silent', // Don't log during tests
};

// Production: JSON format for log aggregation
const prodConfig: pino.LoggerOptions = {
  ...baseConfig,
  // Add service name for log aggregation
  base: {
    service: 'udito',
    version: process.env.npm_package_version || '1.0.0',
  },
};

// Select config based on environment
const config = isTest ? testConfig : isDevelopment ? devConfig : prodConfig;

// Create logger instance
export const logger = pino(config);

// Child loggers for specific domains
export const webhookLogger = logger.child({ domain: 'webhook' });
export const receiptLogger = logger.child({ domain: 'receipt' });
export const syncLogger = logger.child({ domain: 'sync' });
export const authLogger = logger.child({ domain: 'auth' });
export const dbLogger = logger.child({ domain: 'database' });

// Helper for request logging
export function createRequestLogger(requestId: string, siteId?: string) {
  return logger.child({
    requestId,
    siteId,
  });
}

// Helper for error logging with stack trace
export function logError(
  log: pino.Logger,
  error: unknown,
  message: string,
  context?: Record<string, unknown>
) {
  const err = error instanceof Error ? error : new Error(String(error));
  log.error(
    {
      err: {
        message: err.message,
        name: err.name,
        stack: err.stack,
      },
      ...context,
    },
    message
  );
}

// Export types
export type Logger = pino.Logger;
