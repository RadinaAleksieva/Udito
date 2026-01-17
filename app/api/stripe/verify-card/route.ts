import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe, TEST_CHARGE_AMOUNT, TEST_CHARGE_CURRENCY } from "@/lib/stripe";
import { sql } from "@/lib/supabase-sql";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { businessId, paymentMethodId, planId } = await request.json();

    if (!businessId || !paymentMethodId || !planId) {
      return NextResponse.json(
        { error: "Business ID, Payment Method ID and Plan ID required" },
        { status: 400 }
      );
    }

    // Verify user owns this business and get Stripe customer ID
    const businessCheck = await sql`
      SELECT b.id, b.stripe_customer_id
      FROM businesses b
      JOIN business_users bu ON bu.business_id = b.id
      WHERE b.id = ${businessId} AND bu.user_id = ${session.user.id}
      LIMIT 1
    `;

    if (businessCheck.rows.length === 0) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const business = businessCheck.rows[0];

    if (!business.stripe_customer_id) {
      return NextResponse.json(
        { error: "Stripe customer not found" },
        { status: 400 }
      );
    }

    // Attach payment method to customer and set as default
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: business.stripe_customer_id,
    });

    await stripe.customers.update(business.stripe_customer_id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Make test charge of 1 EUR
    const paymentIntent = await stripe.paymentIntents.create({
      amount: TEST_CHARGE_AMOUNT,
      currency: TEST_CHARGE_CURRENCY,
      customer: business.stripe_customer_id,
      payment_method: paymentMethodId,
      confirm: true,
      description: "UDITO - Верификация на карта",
      metadata: {
        business_id: businessId,
        type: "card_verification",
      },
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { error: "Картата не може да бъде таксувана. Моля, опитайте с друга карта." },
        { status: 400 }
      );
    }

    // Immediately refund the test charge
    await stripe.refunds.create({
      payment_intent: paymentIntent.id,
      reason: "requested_by_customer",
    });

    // Calculate trial end date (10 days from now)
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 10);

    // Update business with plan and payment info
    await sql`
      UPDATE businesses
      SET
        selected_plan_id = ${planId},
        stripe_payment_method_id = ${paymentMethodId},
        trial_ends_at = ${trialEndsAt.toISOString()},
        subscription_status = 'trial',
        onboarding_completed = true,
        onboarding_step = 3,
        updated_at = NOW()
      WHERE id = ${businessId}
    `;

    return NextResponse.json({
      success: true,
      trialEndsAt: trialEndsAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Card verification error:", error);

    // Handle Stripe errors
    if (error.type === "StripeCardError") {
      return NextResponse.json(
        { error: error.message || "Картата беше отхвърлена" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Грешка при верификация на картата" },
      { status: 500 }
    );
  }
}
