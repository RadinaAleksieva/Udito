import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";

const APP_ID = process.env.WIX_APP_ID || "";
const APP_PUBLIC_KEY = process.env.WIX_APP_PUBLIC_KEY || "";
const APP_SECRET = process.env.WIX_APP_SECRET || "";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDb();

    // 1. Check environment variables
    const envCheck = {
      hasAppId: !!APP_ID,
      hasPublicKey: !!APP_PUBLIC_KEY,
      hasAppSecret: !!APP_SECRET,
      appIdPrefix: APP_ID.substring(0, 8) + "...",
      publicKeyLength: APP_PUBLIC_KEY.length,
    };

    // 2. Check database for recent orders (to see if webhooks ever worked)
    const recentOrdersResult = await sql`
      SELECT
        id,
        number,
        site_id,
        created_at,
        updated_at,
        source,
        payment_status
      FROM orders
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const recentOrders = recentOrdersResult.rows.map(order => ({
      number: order.number,
      siteId: order.site_id?.substring(0, 8) + "...",
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      source: order.source,
      paymentStatus: order.payment_status,
      timeSinceCreation: order.created_at
        ? `${Math.round((Date.now() - new Date(order.created_at).getTime()) / 1000 / 60)} minutes ago`
        : "unknown"
    }));

    // 3. Check for any webhook orders vs backfill orders
    const sourceBreakdown = await sql`
      SELECT
        source,
        COUNT(*) as count,
        MAX(created_at) as last_order
      FROM orders
      GROUP BY source
    `;

    // 4. Check Wix tokens (to verify connection is valid)
    const tokensResult = await sql`
      SELECT
        id,
        site_id,
        instance_id,
        created_at,
        expires_at,
        CASE WHEN expires_at > NOW() THEN 'valid' ELSE 'expired' END as status
      FROM wix_tokens
      ORDER BY created_at DESC
      LIMIT 5
    `;

    const tokens = tokensResult.rows.map(t => ({
      siteId: t.site_id?.substring(0, 8) + "...",
      instanceId: t.instance_id?.substring(0, 8) + "...",
      createdAt: t.created_at,
      expiresAt: t.expires_at,
      status: t.status,
    }));

    // 5. Check store connections
    const connectionsResult = await sql`
      SELECT
        id,
        site_id,
        instance_id,
        created_at,
        updated_at
      FROM store_connections
      ORDER BY created_at DESC
      LIMIT 5
    `;

    const connections = connectionsResult.rows.map(c => ({
      siteId: c.site_id?.substring(0, 8) + "...",
      instanceId: c.instance_id?.substring(0, 8) + "...",
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    // 6. Expected webhook URL
    const expectedWebhookUrl = "https://udito.vercel.app/api/webhooks/wix/orders";

    // 7. Recommendations based on findings
    const recommendations: string[] = [];

    if (!APP_ID || !APP_PUBLIC_KEY) {
      recommendations.push("CRITICAL: Missing WIX_APP_ID or WIX_APP_PUBLIC_KEY environment variables");
    }

    const webhookOrders = sourceBreakdown.rows.find(r => r.source === "webhook");
    const backfillOrders = sourceBreakdown.rows.find(r => r.source === "backfill");

    if (!webhookOrders || webhookOrders.count === "0") {
      recommendations.push("WARNING: No orders received via webhook. Check Wix Dev Center webhook configuration.");
    }

    if (backfillOrders && parseInt(backfillOrders.count) > 0) {
      recommendations.push(`INFO: ${backfillOrders.count} orders received via manual sync (backfill)`);
    }

    if (tokens.length === 0) {
      recommendations.push("WARNING: No Wix tokens found. OAuth flow may not be complete.");
    }

    // Check if webhooks are configured in Wix
    recommendations.push("ACTION: Verify in Wix Dev Center (https://dev.wix.com) that:");
    recommendations.push("  1. Webhook URL is set to: " + expectedWebhookUrl);
    recommendations.push("  2. eCommerce Orders webhooks are enabled (Created, Updated, PaymentStatusUpdated)");
    recommendations.push("  3. App has required permissions: ECOM.READ_ORDERS, ECOM.MANAGE_ORDERS");

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      environmentVariables: envCheck,
      webhookEndpoint: expectedWebhookUrl,
      orderSources: sourceBreakdown.rows,
      recentOrders,
      wixTokens: tokens,
      storeConnections: connections,
      recommendations,
      debugInfo: {
        message: "To test webhooks, create a test order in your Wix store and check Vercel logs",
        vercelLogsUrl: "https://vercel.com/dashboard → Select project → Functions tab → Logs",
      }
    });
  } catch (error) {
    console.error("Webhook diagnostics error:", error);
    return NextResponse.json({
      error: "Internal error",
      message: (error as Error).message
    }, { status: 500 });
  }
}
