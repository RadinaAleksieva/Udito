import { NextResponse } from "next/server";
import { sql } from "@/lib/supabase-sql";
import { auth, getActiveStore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const storeParam = searchParams.get("store");

  const store = await getActiveStore(storeParam);

  if (!store?.siteId && !store?.instanceId) {
    return NextResponse.json({ error: "No active store" }, { status: 400 });
  }

  // Use site_id as primary identifier, instance_id as fallback
  // NEVER use OR between them - it can match wrong store!
  const primaryId = store.siteId;
  const fallbackId = store.instanceId;

  try {
    // Get all users with access to this store
    // Priority: match by site_id first, then by instance_id
    let result;

    if (primaryId) {
      result = await sql`
        SELECT
          sc.id,
          sc.user_id,
          sc.role,
          sc.access_code,
          sc.access_code_expires_at,
          sc.connected_at,
          sc.invited_by,
          sc.invited_at,
          u.email,
          u.name,
          u.image
        FROM store_connections sc
        LEFT JOIN users u ON sc.user_id = u.id
        WHERE sc.site_id = ${primaryId}
        ORDER BY sc.connected_at ASC
      `;
    }

    // If no results by site_id and we have instanceId, try by instance_id
    if ((!result || result.rows.length === 0) && fallbackId) {
      result = await sql`
        SELECT
          sc.id,
          sc.user_id,
          sc.role,
          sc.access_code,
          sc.access_code_expires_at,
          sc.connected_at,
          sc.invited_by,
          sc.invited_at,
          u.email,
          u.name,
          u.image
        FROM store_connections sc
        LEFT JOIN users u ON sc.user_id = u.id
        WHERE sc.instance_id = ${fallbackId}
        ORDER BY sc.connected_at ASC
      `;
    }

    if (!result) {
      result = { rows: [] };
    }

    // Check if current user is owner/admin
    const currentUserRole = result.rows.find(r => r.user_id === session.user.id)?.role || "member";
    const canManage = ["owner", "admin"].includes(currentUserRole);

    const members = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      email: row.email,
      name: row.name || row.email?.split("@")[0] || "Потребител",
      image: row.image,
      role: row.role || "member",
      hasAccessCode: Boolean(row.access_code),
      accessCodeExpiresAt: row.access_code_expires_at,
      connectedAt: row.connected_at,
      invitedBy: row.invited_by,
      invitedAt: row.invited_at,
      isCurrentUser: row.user_id === session.user.id,
    }));

    return NextResponse.json({
      ok: true,
      members,
      currentUserRole,
      canManage,
      totalMembers: members.length,
      maxMembers: 3, // Limit as requested
    });
  } catch (error) {
    console.error("Error listing access:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
