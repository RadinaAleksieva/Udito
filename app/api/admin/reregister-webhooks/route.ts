import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getAccessToken } from "@/lib/wix";

const WIX_API_BASE = "https://www.wixapis.com";

export const dynamic = "force-dynamic";

/**
 * Force re-register webhooks for all companies with instanceId
 * This ensures webhook URLs include instanceId and siteId params
 */
export async function POST() {
  try {
    await initDb();

    // Get all companies with instanceId
    const companies = await sql`
      SELECT site_id, instance_id, store_name
      FROM companies
      WHERE instance_id IS NOT NULL
    `;

    const results = [];

    for (const company of companies.rows) {
      const { site_id, instance_id, store_name } = company;

      try {
        const accessToken = await getAccessToken({
          instanceId: instance_id,
          siteId: site_id
        });

        const authHeader = accessToken.startsWith("Bearer ")
          ? accessToken
          : `Bearer ${accessToken}`;

        // Build webhook URL with instanceId and siteId params
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://udito.vercel.app";
        const params = new URLSearchParams();
        params.set("instanceId", instance_id);
        if (site_id) params.set("siteId", site_id);
        const webhookUrl = `${baseUrl}/api/webhooks/wix/orders?${params.toString()}`;

        // First, try to delete existing webhooks (optional - Wix may not support this easily)
        // Then register new webhook
        const response = await fetch(`${WIX_API_BASE}/webhooks/v1/webhooks`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            ...(site_id ? { "wix-site-id": site_id } : {}),
          },
          body: JSON.stringify({
            webhook: {
              url: webhookUrl,
              eventTypes: [
                "wix.ecom.v1.order.created",
                "wix.ecom.v1.order.updated",
                "wix.ecom.v1.order.canceled",
              ],
            },
          }),
        });

        const responseText = await response.text();
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch {
          responseData = responseText;
        }

        results.push({
          store_name,
          instance_id,
          site_id,
          webhookUrl,
          success: response.ok,
          status: response.status,
          response: responseData,
        });
      } catch (error) {
        results.push({
          store_name,
          instance_id,
          site_id,
          success: false,
          error: (error as Error).message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      companiesProcessed: companies.rows.length,
      results,
    });
  } catch (error) {
    console.error("Webhook re-registration failed:", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
