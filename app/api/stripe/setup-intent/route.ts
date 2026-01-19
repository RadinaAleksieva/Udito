import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { sql } from "@/lib/sql";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { businessId } = await request.json();

    if (!businessId) {
      return NextResponse.json({ error: "Business ID required" }, { status: 400 });
    }

    // Verify user owns this business
    const businessCheck = await sql`
      SELECT b.id, b.stripe_customer_id, u.email
      FROM businesses b
      JOIN business_users bu ON bu.business_id = b.id
      JOIN users u ON u.id = bu.user_id
      WHERE b.id = ${businessId} AND bu.user_id = ${session.user.id}
      LIMIT 1
    `;

    if (businessCheck.rows.length === 0) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const business = businessCheck.rows[0];
    let stripeCustomerId = business.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: business.email || session.user.email || undefined,
        metadata: {
          business_id: businessId,
          user_id: session.user.id,
        },
      });
      stripeCustomerId = customer.id;

      // Save customer ID to database
      await sql`
        UPDATE businesses
        SET stripe_customer_id = ${stripeCustomerId}, updated_at = NOW()
        WHERE id = ${businessId}
      `;
    }

    // Create SetupIntent for collecting card
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      metadata: {
        business_id: businessId,
      },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId: stripeCustomerId,
    });
  } catch (error) {
    console.error("SetupIntent error:", error);
    return NextResponse.json(
      { error: "Failed to create setup intent" },
      { status: 500 }
    );
  }
}
