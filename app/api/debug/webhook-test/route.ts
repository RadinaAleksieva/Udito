import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb, upsertOrder } from "@/lib/db";

export const dynamic = "force-dynamic";

// This endpoint simulates a webhook to test if our handler works
export async function POST(request: NextRequest) {
  try {
    await initDb();

    // Get the test order data from request or use defaults
    const body = await request.json().catch(() => ({}));

    const testOrderId = body.orderId || `test-${Date.now()}`;
    const testOrderNumber = body.orderNumber || `TEST-${Math.floor(Math.random() * 10000)}`;
    const siteId = body.siteId || null;

    // Check if we have a valid siteId from the database
    let effectiveSiteId = siteId;
    if (!effectiveSiteId) {
      const companyResult = await sql`
        SELECT site_id FROM companies WHERE site_id IS NOT NULL LIMIT 1
      `;
      effectiveSiteId = companyResult.rows[0]?.site_id || null;
    }

    console.log("=== WEBHOOK TEST ===");
    console.log("Test order ID:", testOrderId);
    console.log("Test order number:", testOrderNumber);
    console.log("Site ID:", effectiveSiteId);

    // Create a minimal test order
    const testOrder = {
      id: testOrderId,
      siteId: effectiveSiteId,
      number: testOrderNumber,
      status: "APPROVED",
      paymentStatus: "PAID",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      currency: "BGN",
      subtotal: 10,
      taxTotal: 2,
      shippingTotal: 5,
      discountTotal: 0,
      total: 17,
      customerEmail: "test@example.com",
      customerName: "Test Customer",
      source: "webhook-test",
      businessId: null,
      raw: {
        id: testOrderId,
        number: testOrderNumber,
        status: "APPROVED",
        paymentStatus: "PAID",
        test: true,
      }
    };

    // Try to save the order
    await upsertOrder(testOrder);

    // Verify it was saved
    const savedResult = await sql`
      SELECT id, number, source, created_at
      FROM orders
      WHERE id = ${testOrderId}
    `;

    const saved = savedResult.rows[0];

    return NextResponse.json({
      success: true,
      message: "Test webhook processed successfully",
      testOrder: {
        id: testOrderId,
        number: testOrderNumber,
        siteId: effectiveSiteId,
      },
      savedOrder: saved ? {
        id: saved.id,
        number: saved.number,
        source: saved.source,
        createdAt: saved.created_at,
      } : null,
      note: "This test bypasses Wix webhook signature verification. Real webhooks require valid JWS tokens."
    });
  } catch (error) {
    console.error("Webhook test error:", error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack,
    }, { status: 500 });
  }
}

// GET endpoint to show instructions
export async function GET() {
  return NextResponse.json({
    usage: "POST to this endpoint to test webhook processing",
    example: {
      method: "POST",
      body: {
        orderId: "optional-custom-id",
        orderNumber: "optional-custom-number",
        siteId: "optional-site-id"
      }
    },
    note: "This creates a test order to verify database connectivity and order processing"
  });
}
