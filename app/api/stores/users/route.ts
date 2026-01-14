import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const siteId = url.searchParams.get("siteId");

    if (!siteId) {
      return NextResponse.json({ error: "Site ID required" }, { status: 400 });
    }

    // Check if user has access to this store
    const accessCheck = await sql`
      SELECT role FROM store_connections
      WHERE site_id = ${siteId} AND user_id = ${session.user.id}
      LIMIT 1
    `;

    if (accessCheck.rows.length === 0) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get all users with access to this store
    const usersResult = await sql`
      SELECT u.id, u.email, u.name, sc.role, sc.connected_at
      FROM store_connections sc
      JOIN users u ON u.id = sc.user_id
      WHERE sc.site_id = ${siteId}
      ORDER BY sc.connected_at ASC
    `;

    // Get current active access code
    const codeResult = await sql`
      SELECT code, role, expires_at
      FROM access_codes
      WHERE site_id = ${siteId} AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return NextResponse.json({
      users: usersResult.rows,
      accessCode: codeResult.rows[0] || null,
    });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId, userId } = await request.json();

    if (!siteId || !userId) {
      return NextResponse.json({ error: "Site ID and User ID required" }, { status: 400 });
    }

    // Check if requesting user is owner of this store
    const ownerCheck = await sql`
      SELECT role FROM store_connections
      WHERE site_id = ${siteId} AND user_id = ${session.user.id}
      LIMIT 1
    `;

    if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].role !== "owner") {
      return NextResponse.json({ error: "Only owner can remove users" }, { status: 403 });
    }

    // Check target user's role - can't remove another owner
    const targetCheck = await sql`
      SELECT role FROM store_connections
      WHERE site_id = ${siteId} AND user_id = ${userId}
      LIMIT 1
    `;

    if (targetCheck.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (targetCheck.rows[0].role === "owner") {
      return NextResponse.json({ error: "Cannot remove owner" }, { status: 400 });
    }

    // Remove user from store
    await sql`
      DELETE FROM store_connections
      WHERE site_id = ${siteId} AND user_id = ${userId}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Remove user error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
