import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getAccessToken } from "@/lib/wix";

export const dynamic = "force-dynamic";

const APP_ID = process.env.WIX_APP_ID || "";
const APP_SECRET = process.env.WIX_APP_SECRET || "";
const APP_PUBLIC_KEY = process.env.WIX_APP_PUBLIC_KEY || "";

export async function GET() {
  try {
    await initDb();

    const issues: string[] = [];
    const checks: Record<string, any> = {};

    // 1. Environment Variables Check
    checks.envVars = {
      WIX_APP_ID: APP_ID ? `✅ Set (${APP_ID.substring(0, 8)}...)` : "❌ MISSING",
      WIX_APP_SECRET: APP_SECRET ? "✅ Set" : "❌ MISSING",
      WIX_APP_PUBLIC_KEY: APP_PUBLIC_KEY ? `✅ Set (${APP_PUBLIC_KEY.length} chars)` : "❌ MISSING",
    };

    if (!APP_ID) issues.push("WIX_APP_ID environment variable is not set");
    if (!APP_SECRET) issues.push("WIX_APP_SECRET environment variable is not set");
    if (!APP_PUBLIC_KEY) issues.push("WIX_APP_PUBLIC_KEY is not set - webhook processing will fail!");

    // 2. Database Check - Companies
    const companiesResult = await sql`
      SELECT site_id, instance_id, store_name, store_id, cod_receipts_enabled, created_at
      FROM companies
      ORDER BY created_at DESC
      LIMIT 5
    `;
    checks.companies = companiesResult.rows.map(c => ({
      storeName: c.store_name,
      hasSiteId: !!c.site_id,
      hasInstanceId: !!c.instance_id,
      hasStoreId: !!c.store_id,
      codEnabled: c.cod_receipts_enabled,
    }));

    if (companiesResult.rows.length === 0) {
      issues.push("No companies found in database - OAuth flow may not be complete");
    }

    // 3. Check for Wix tokens
    const tokensResult = await sql`
      SELECT id, site_id, instance_id, expires_at,
             CASE WHEN expires_at > NOW() THEN true ELSE false END as is_valid
      FROM wix_tokens
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const latestToken = tokensResult.rows[0];
    checks.latestWixToken = latestToken ? {
      hasSiteId: !!latestToken.site_id,
      hasInstanceId: !!latestToken.instance_id,
      isValid: latestToken.is_valid,
      expiresAt: latestToken.expires_at,
    } : null;

    if (!latestToken) {
      issues.push("No Wix tokens found - API calls won't work");
    } else if (!latestToken.is_valid) {
      issues.push("Latest Wix token is expired - need to refresh");
    }

    // 4. Try to get fresh access token (if possible)
    let tokenTest = { success: false, error: null as string | null };
    try {
      const token = await getAccessToken();
      tokenTest = { success: !!token, error: null };
    } catch (error) {
      tokenTest = { success: false, error: (error as Error).message };
      issues.push(`Cannot get Wix access token: ${(error as Error).message}`);
    }
    checks.tokenGeneration = tokenTest;

    // 5. Order source statistics
    const orderStats = await sql`
      SELECT
        source,
        COUNT(*) as count,
        MAX(created_at) as latest
      FROM orders
      GROUP BY source
      ORDER BY count DESC
    `;
    checks.orderSources = orderStats.rows;

    const webhookCount = orderStats.rows.find(r => r.source === 'webhook')?.count || 0;
    if (parseInt(String(webhookCount)) === 0) {
      issues.push("No orders received via webhook - webhooks are NOT working!");
    }

    // 6. Webhook Configuration Requirements
    const webhookConfig = {
      webhookUrl: "https://udito.vercel.app/api/webhooks/wix/orders",
      requiredEvents: [
        "wix.ecom.v1.order created",
        "wix.ecom.v1.order updated",
        "wix.ecom.v1.order payment_status_updated",
        "wix.ecom.v1.order canceled",
      ],
      requiredPermissions: [
        "ECOM.READ_ORDERS",
        "ECOM.MANAGE_ORDERS",
        "PAYMENTS.READ",
      ],
    };

    // Instructions for fixing
    const fixInstructions = [
      "1. Go to Wix Dev Center: https://dev.wix.com/apps/" + (APP_ID || "YOUR_APP_ID"),
      "2. Navigate to 'Webhooks' section",
      "3. Make sure webhook endpoint is set to: " + webhookConfig.webhookUrl,
      "4. Enable these events:",
      "   - wix.ecom.v1.order (Created, Updated, Canceled)",
      "   - Order Payment Status Updated",
      "5. Check 'Permissions' tab has: ECOM.READ_ORDERS, ECOM.MANAGE_ORDERS, PAYMENTS.READ",
      "6. Make sure the app is installed on the site (reinstall if needed)",
      "",
      "After fixing, create a test order in your Wix store to verify webhooks work.",
      "Check Vercel logs at: https://vercel.com/dashboard → your project → Functions → Logs",
    ];

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      status: issues.length === 0 ? "✅ All checks passed" : `⚠️ ${issues.length} issues found`,
      issues,
      checks,
      webhookConfig,
      fixInstructions,
    });
  } catch (error) {
    console.error("Wix setup check error:", error);
    return NextResponse.json({
      error: "Internal error",
      message: (error as Error).message,
    }, { status: 500 });
  }
}
