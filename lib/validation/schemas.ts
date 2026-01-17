/**
 * Input validation schemas using Zod
 *
 * All API inputs should be validated using these schemas.
 * Usage:
 *   const validated = companySchema.parse(body);
 *   // or with error handling:
 *   const result = companySchema.safeParse(body);
 *   if (!result.success) { handle errors }
 */

import { z } from 'zod';

// ============================================================================
// Common Patterns
// ============================================================================

// Bulgarian EIK (Unified Identification Code) - 9 or 13 digits
export const eikSchema = z
  .string()
  .regex(/^\d{9}(\d{4})?$/, 'EIK must be 9 or 13 digits');

// Bulgarian VAT number - BG + 9-10 digits
export const vatNumberSchema = z
  .string()
  .regex(/^BG\d{9,10}$/, 'VAT number must be in format BG123456789')
  .optional()
  .nullable();

// UUID v4
export const uuidSchema = z.string().uuid('Invalid UUID format');

// Wix siteId (can be UUID or other format)
export const siteIdSchema = z.string().min(1, 'Site ID is required');

// Email
export const emailSchema = z.string().email('Invalid email address');

// Phone (Bulgarian format)
export const phoneSchema = z
  .string()
  .regex(/^(\+359|0)[0-9]{9}$/, 'Invalid phone number')
  .optional()
  .nullable();

// IBAN (Bulgarian)
export const ibanSchema = z
  .string()
  .regex(/^BG\d{2}[A-Z]{4}\d{14}$/, 'Invalid IBAN format')
  .optional()
  .nullable();

// Positive integer
export const positiveIntSchema = z.number().int().positive();

// Non-negative number
export const nonNegativeSchema = z.number().nonnegative();

// ============================================================================
// Company Schemas
// ============================================================================

export const companyUpdateSchema = z.object({
  legalName: z.string().min(1, 'Legal name is required').max(200).optional(),
  bulstat: eikSchema.optional(),
  vatNumber: vatNumberSchema,
  addressLine1: z.string().min(1).max(200).optional(),
  addressLine2: z.string().max(200).optional().nullable(),
  city: z.string().min(1).max(100).optional(),
  postalCode: z.string().max(10).optional().nullable(),
  country: z.string().max(100).default('България'),
  phone: phoneSchema,
  email: emailSchema.optional().nullable(),
  iban: ibanSchema,
  bankName: z.string().max(100).optional().nullable(),
  mol: z.string().max(200).optional().nullable(), // Manager name
  storeId: z.string().max(50).optional().nullable(), // Fiscal store ID (RF...)
});

export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;

// ============================================================================
// Receipt Schemas
// ============================================================================

export const issueReceiptSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  siteId: siteIdSchema,
});

export type IssueReceiptInput = z.infer<typeof issueReceiptSchema>;

export const cancelReceiptSchema = z.object({
  receiptId: positiveIntSchema,
});

export type CancelReceiptInput = z.infer<typeof cancelReceiptSchema>;

export const receiptSettingsSchema = z.object({
  receiptsStartDate: z.string().datetime().optional().nullable(),
  codReceiptsEnabled: z.boolean().default(false),
  receiptNumberStart: positiveIntSchema.optional().nullable(),
});

export type ReceiptSettingsInput = z.infer<typeof receiptSettingsSchema>;

export const returnTypeSchema = z.object({
  receiptId: positiveIntSchema,
  returnPaymentType: z.number().int().min(1).max(4), // 1=cash, 2=card, 3=bank, 4=other
});

export type ReturnTypeInput = z.infer<typeof returnTypeSchema>;

// ============================================================================
// Order Schemas
// ============================================================================

export const orderListSchema = z.object({
  siteId: siteIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  paymentStatus: z.enum(['PAID', 'NOT_PAID', 'PARTIALLY_PAID', 'REFUNDED']).optional(),
});

export type OrderListInput = z.infer<typeof orderListSchema>;

// ============================================================================
// Authentication Schemas
// ============================================================================

export const registerSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain uppercase, lowercase, and number'
    ),
  name: z.string().min(1).max(100).optional(),
  storeName: z.string().min(1).max(200).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

// ============================================================================
// Store Connection Schemas
// ============================================================================

export const connectStoreSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID is required'),
});

export type ConnectStoreInput = z.infer<typeof connectStoreSchema>;

export const joinStoreSchema = z.object({
  accessCode: z
    .string()
    .length(6, 'Access code must be 6 characters')
    .regex(/^[A-Z0-9]+$/, 'Invalid access code format'),
});

export type JoinStoreInput = z.infer<typeof joinStoreSchema>;

export const generateAccessCodeSchema = z.object({
  expiresInHours: z.number().int().min(1).max(168).default(24), // Max 1 week
});

export type GenerateAccessCodeInput = z.infer<typeof generateAccessCodeSchema>;

// ============================================================================
// Onboarding Schemas
// ============================================================================

export const onboardingCompanySchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(200),
  bulstat: eikSchema,
  vatNumber: vatNumberSchema,
  address: z.string().min(1, 'Address is required').max(500),
  city: z.string().min(1, 'City is required').max(100),
  mol: z.string().min(1, 'MOL is required').max(200),
  useSameForBilling: z.boolean().default(true),
  billingCompany: z
    .object({
      companyName: z.string().min(1).max(200),
      bulstat: eikSchema,
      vatNumber: vatNumberSchema,
      address: z.string().min(1).max(500),
      city: z.string().min(1).max(100),
    })
    .optional()
    .nullable(),
});

export type OnboardingCompanyInput = z.infer<typeof onboardingCompanySchema>;

export const onboardingSettingsSchema = z.object({
  receiptsStartDate: z.string().datetime(),
  codReceiptsEnabled: z.boolean().default(false),
  receiptNumberStart: positiveIntSchema.optional(),
});

export type OnboardingSettingsInput = z.infer<typeof onboardingSettingsSchema>;

export const onboardingPlanSchema = z.object({
  planId: z.enum(['starter', 'business', 'corporate']),
});

export type OnboardingPlanInput = z.infer<typeof onboardingPlanSchema>;

// ============================================================================
// Webhook Schemas
// ============================================================================

export const webhookPayloadSchema = z.object({
  data: z.unknown(),
  metadata: z
    .object({
      eventType: z.string().optional(),
      instanceId: z.string().optional(),
      siteId: z.string().optional(),
      eventTime: z.string().optional(),
    })
    .optional(),
});

// ============================================================================
// Sync Schemas
// ============================================================================

export const syncSchema = z.object({
  siteId: siteIdSchema.optional(),
  startDate: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  issueReceipts: z.boolean().default(false),
});

export type SyncInput = z.infer<typeof syncSchema>;

// ============================================================================
// Audit Schemas
// ============================================================================

export const auditMonthlySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  siteId: siteIdSchema.optional(),
});

export type AuditMonthlyInput = z.infer<typeof auditMonthlySchema>;

// ============================================================================
// Validation Helper Functions
// ============================================================================

import { ValidationError } from '@/lib/errors';

/**
 * Validate input and throw ValidationError if invalid
 */
export function validateOrThrow<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    // Zod v4 uses 'issues' instead of 'errors'
    // eslint-disable-next-line
    const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
    // eslint-disable-next-line
    const errors = issues.map((e: any) => ({
      field: String(e.path?.join?.('.') ?? ''),
      message: String(e.message ?? 'Unknown error'),
    }));
    throw new ValidationError('Validation failed', errors);
  }

  return result.data;
}

/**
 * Validate input and return result (no throw)
 */
export function validateSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Array<{ field: string; message: string }> } {
  const result = schema.safeParse(data);

  if (!result.success) {
    // Zod v4 uses 'issues' instead of 'errors'
    // eslint-disable-next-line
    const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
    return {
      success: false,
      // eslint-disable-next-line
      errors: issues.map((e: any) => ({
        field: String(e.path?.join?.('.') ?? ''),
        message: String(e.message ?? 'Unknown error'),
      })),
    };
  }

  return { success: true, data: result.data };
}

/**
 * Validate query parameters from URL
 */
export function validateQueryParams<T>(schema: z.ZodSchema<T>, url: string | URL): T {
  const urlObj = typeof url === 'string' ? new URL(url) : url;
  const params = Object.fromEntries(urlObj.searchParams.entries());
  return validateOrThrow(schema, params);
}
