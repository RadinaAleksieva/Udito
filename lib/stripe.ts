import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
});

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
