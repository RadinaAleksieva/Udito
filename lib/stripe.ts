import Stripe from "stripe";

// Lazy initialization - don't throw during build
let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeInstance;
}

// For backwards compatibility - use getStripe() instead
export const stripe = {
  get customers() { return getStripe().customers; },
  get paymentMethods() { return getStripe().paymentMethods; },
  get paymentIntents() { return getStripe().paymentIntents; },
  get setupIntents() { return getStripe().setupIntents; },
  get refunds() { return getStripe().refunds; },
};

// Plan to Stripe Price ID mapping
export const PLAN_PRICE_IDS: Record<string, { monthly: string }> = {
  starter: {
    monthly: process.env.STRIPE_STARTER_PRICE_ID || "",
  },
  business: {
    monthly: process.env.STRIPE_BUSINESS_PRICE_ID || "",
  },
  corporate: {
    monthly: process.env.STRIPE_CORPORATE_PRICE_ID || "",
  },
};

// Test charge amount (1 EUR in cents)
export const TEST_CHARGE_AMOUNT = 100;
export const TEST_CHARGE_CURRENCY = "eur";
