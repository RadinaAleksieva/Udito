import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@/lib/sql";
import { authOptions } from "@/lib/auth";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

export async function GET() {
  try {
    await initDb();

    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get recent webhook logs
    const logsResult = await sql`
      SELECT
        id,
        event_type,
        order_id,
        order_number,
        site_id,
        instance_id,
        status,
        error_message,
        payload_preview,
        created_at
      FROM webhook_logs
      ORDER BY created_at DESC
      LIMIT 100
    `;

    // Get summary statistics
    const statsResult = await sql`
      SELECT
        status,
        COUNT(*) as count,
        MAX(created_at) as latest
      FROM webhook_logs
      GROUP BY status
      ORDER BY count DESC
    `;

    // Get count by event type
    const byTypeResult = await sql`
      SELECT
        event_type,
        COUNT(*) as count,
        MAX(created_at) as latest
      FROM webhook_logs
      GROUP BY event_type
      ORDER BY count DESC
    `;

    return NextResponse.json({
      logs: logsResult.rows.map(log => ({
        ...log,
        payloadPreview: log.payload_preview?.substring(0, 200) + (log.payload_preview?.length > 200 ? '...' : ''),
      })),
      stats: statsResult.rows,
      byEventType: byTypeResult.rows,
      totalCount: logsResult.rows.length,
    });
  } catch (error) {
    console.error("Webhook logs error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE - Clear old logs
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete logs older than 7 days
    await sql`DELETE FROM webhook_logs WHERE created_at < NOW() - INTERVAL '7 days'`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Clear webhook logs error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
