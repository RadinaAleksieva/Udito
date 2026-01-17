/**
 * Custom error classes for UDITO
 *
 * All errors extend UditoError and include:
 * - code: Machine-readable error code
 * - statusCode: HTTP status code
 * - details: Additional context
 */

export class UditoError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'UditoError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        name: this.name,
        code: this.code,
        message: this.message,
        statusCode: this.statusCode,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

export class AuthenticationError extends UditoError {
  constructor(message: string = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 'AUTH_REQUIRED', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends UditoError {
  constructor(message: string = 'Permission denied', details?: Record<string, unknown>) {
    super(message, 'PERMISSION_DENIED', 403, details);
    this.name = 'AuthorizationError';
  }
}

export class InvalidCredentialsError extends UditoError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS', 401);
    this.name = 'InvalidCredentialsError';
  }
}

// ============================================================================
// Tenant Errors
// ============================================================================

export class TenantNotFoundError extends UditoError {
  constructor(siteId: string) {
    super(`Tenant not found: ${siteId}`, 'TENANT_NOT_FOUND', 404, { siteId });
    this.name = 'TenantNotFoundError';
  }
}

export class TenantAccessDeniedError extends UditoError {
  constructor(siteId: string, userId?: string) {
    super(
      `Access denied to tenant: ${siteId}`,
      'TENANT_ACCESS_DENIED',
      403,
      { siteId, userId }
    );
    this.name = 'TenantAccessDeniedError';
  }
}

// ============================================================================
// Order Errors
// ============================================================================

export class OrderNotFoundError extends UditoError {
  constructor(orderId: string) {
    super(`Order not found: ${orderId}`, 'ORDER_NOT_FOUND', 404, { orderId });
    this.name = 'OrderNotFoundError';
  }
}

export class OrderNotPaidError extends UditoError {
  constructor(orderId: string, paymentStatus?: string) {
    super(
      `Order is not paid: ${orderId}`,
      'ORDER_NOT_PAID',
      400,
      { orderId, paymentStatus }
    );
    this.name = 'OrderNotPaidError';
  }
}

export class OrderAlreadyProcessedError extends UditoError {
  constructor(orderId: string) {
    super(
      `Order already processed: ${orderId}`,
      'ORDER_ALREADY_PROCESSED',
      409,
      { orderId }
    );
    this.name = 'OrderAlreadyProcessedError';
  }
}

// ============================================================================
// Receipt Errors
// ============================================================================

export class ReceiptNotFoundError extends UditoError {
  constructor(receiptId: number | string) {
    super(`Receipt not found: ${receiptId}`, 'RECEIPT_NOT_FOUND', 404, { receiptId });
    this.name = 'ReceiptNotFoundError';
  }
}

export class ReceiptAlreadyExistsError extends UditoError {
  constructor(orderId: string, receiptId?: number) {
    super(
      `Receipt already exists for order: ${orderId}`,
      'RECEIPT_ALREADY_EXISTS',
      409,
      { orderId, receiptId }
    );
    this.name = 'ReceiptAlreadyExistsError';
  }
}

export class ReceiptIssuanceError extends UditoError {
  constructor(orderId: string, reason: string) {
    super(
      `Cannot issue receipt for order ${orderId}: ${reason}`,
      'RECEIPT_ISSUANCE_FAILED',
      400,
      { orderId, reason }
    );
    this.name = 'ReceiptIssuanceError';
  }
}

export class MissingFiscalDataError extends UditoError {
  constructor(siteId: string, missingFields: string[]) {
    super(
      `Missing fiscal data for receipts: ${missingFields.join(', ')}`,
      'MISSING_FISCAL_DATA',
      400,
      { siteId, missingFields }
    );
    this.name = 'MissingFiscalDataError';
  }
}

// ============================================================================
// Company Errors
// ============================================================================

export class CompanyNotFoundError extends UditoError {
  constructor(siteId?: string, instanceId?: string) {
    super(
      'Company not found',
      'COMPANY_NOT_FOUND',
      404,
      { siteId, instanceId }
    );
    this.name = 'CompanyNotFoundError';
  }
}

export class CompanyNotConfiguredError extends UditoError {
  constructor(siteId: string, missingFields: string[]) {
    super(
      `Company not fully configured: ${missingFields.join(', ')}`,
      'COMPANY_NOT_CONFIGURED',
      400,
      { siteId, missingFields }
    );
    this.name = 'CompanyNotConfiguredError';
  }
}

// ============================================================================
// Webhook Errors
// ============================================================================

export class WebhookError extends UditoError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WEBHOOK_ERROR', 400, details);
    this.name = 'WebhookError';
  }
}

export class WebhookSignatureError extends UditoError {
  constructor() {
    super('Invalid webhook signature', 'WEBHOOK_SIGNATURE_INVALID', 401);
    this.name = 'WebhookSignatureError';
  }
}

export class DuplicateWebhookError extends UditoError {
  constructor(eventId: string) {
    super(`Duplicate webhook event: ${eventId}`, 'WEBHOOK_DUPLICATE', 409, { eventId });
    this.name = 'DuplicateWebhookError';
  }
}

export class MissingSiteContextError extends UditoError {
  constructor() {
    super(
      'Webhook missing site context (siteId or instanceId)',
      'WEBHOOK_MISSING_CONTEXT',
      400
    );
    this.name = 'MissingSiteContextError';
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends UditoError {
  constructor(message: string, errors: Array<{ field: string; message: string }>) {
    super(message, 'VALIDATION_ERROR', 400, { errors });
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Rate Limiting Errors
// ============================================================================

export class RateLimitError extends UditoError {
  constructor(limit: number, resetAt: Date) {
    super(
      `Rate limit exceeded. Try again later.`,
      'RATE_LIMIT_EXCEEDED',
      429,
      {
        limit,
        resetAt: resetAt.toISOString(),
        retryAfter: Math.ceil((resetAt.getTime() - Date.now()) / 1000),
      }
    );
    this.name = 'RateLimitError';
  }
}

// ============================================================================
// External Service Errors
// ============================================================================

export class WixApiError extends UditoError {
  constructor(message: string, originalError?: unknown) {
    super(
      `Wix API error: ${message}`,
      'WIX_API_ERROR',
      502,
      { originalError: originalError instanceof Error ? originalError.message : String(originalError) }
    );
    this.name = 'WixApiError';
  }
}

export class StripeError extends UditoError {
  constructor(message: string, stripeCode?: string) {
    super(
      `Stripe error: ${message}`,
      'STRIPE_ERROR',
      502,
      { stripeCode }
    );
    this.name = 'StripeError';
  }
}

export class DatabaseError extends UditoError {
  constructor(message: string, query?: string) {
    super(
      `Database error: ${message}`,
      'DATABASE_ERROR',
      500,
      { query: query?.substring(0, 100) } // Truncate query for safety
    );
    this.name = 'DatabaseError';
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if error is a UditoError
 */
export function isUditoError(error: unknown): error is UditoError {
  return error instanceof UditoError;
}

/**
 * Convert any error to a safe JSON response
 */
export function errorToResponse(error: unknown) {
  if (isUditoError(error)) {
    return error.toJSON();
  }

  // Generic error - hide details in production
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? 'An unexpected error occurred' : (error as Error).message,
      statusCode: 500,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Get HTTP status code from error
 */
export function getErrorStatusCode(error: unknown): number {
  if (isUditoError(error)) {
    return error.statusCode;
  }
  return 500;
}
