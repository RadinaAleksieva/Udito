import { NextResponse } from "next/server";
import { sql } from "@/lib/supabase-sql";
import { initDb } from "@/lib/db";
import { decodeWixInstanceToken } from "@/lib/wix-instance";
import { getAppInstanceDetails } from "@/lib/wix";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { instance, instanceId, siteId } = await request.json();

    await initDb();

    // Decode instance token if provided
    let effectiveInstanceId = instanceId;
    let effectiveSiteId = siteId;

    if (instance) {
      const payload = decodeWixInstanceToken(instance, process.env.WIX_APP_SECRET);
      if (payload?.instanceId) effectiveInstanceId = payload.instanceId;
      if (payload?.siteId) effectiveSiteId = payload.siteId;
    }

    // If we have instanceId but no siteId, try to get it from Wix API
    if (effectiveInstanceId && !effectiveSiteId) {
      try {
        const appInstance = await getAppInstanceDetails({ instanceId: effectiveInstanceId });
        if (appInstance?.siteId) {
          effectiveSiteId = appInstance.siteId;
        }
      } catch (e) {
        console.warn("Failed to get siteId from Wix API:", e);
      }
    }

    if (!effectiveInstanceId && !effectiveSiteId) {
      return NextResponse.json({
        hasUser: false,
        needsRegistration: true,
        error: "No valid Wix params",
      });
    }

    // Check if there's a user connected to this store
    const storeResult = await sql`
      SELECT sc.user_id, sc.role, sc.site_id, sc.instance_id, u.email, u.name
      FROM store_connections sc
      LEFT JOIN users u ON u.id = sc.user_id
      WHERE (${effectiveSiteId}::text IS NOT NULL AND sc.site_id = ${effectiveSiteId})
         OR (${effectiveInstanceId}::text IS NOT NULL AND sc.instance_id = ${effectiveInstanceId})
      ORDER BY sc.connected_at ASC
      LIMIT 1
    `;

    if (storeResult.rows.length > 0 && storeResult.rows[0].user_id) {
      const user = storeResult.rows[0];
      return NextResponse.json({
        hasUser: true,
        needsRegistration: false,
        userId: user.user_id,
        userEmail: user.email,
        userName: user.name,
        siteId: effectiveSiteId || user.site_id,
        instanceId: effectiveInstanceId || user.instance_id,
      });
    }

    // No user found - needs registration
    return NextResponse.json({
      hasUser: false,
      needsRegistration: true,
      siteId: effectiveSiteId,
      instanceId: effectiveInstanceId,
    });
  } catch (error) {
    console.error("Check Wix store error:", error);
    return NextResponse.json(
      { hasUser: false, needsRegistration: true, error: "Internal error" },
      { status: 500 }
    );
  }
}
