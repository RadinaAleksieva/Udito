import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await initDb();

    const logId = request.nextUrl.searchParams.get("id");

    if (logId) {
      // Get specific webhook log with full payload
      const result = await sql`
        SELECT id, event_type, order_id, order_number, site_id, instance_id,
               status, error_message, payload_preview, created_at
        FROM webhook_logs
        WHERE id = ${parseInt(logId)}
      `;
      return NextResponse.json({
        log: result.rows[0] || null,
      });
    }

    // Get all webhook logs with payload previews
    const logs = await sql`
      SELECT id, event_type, order_id, order_number, site_id, instance_id,
             status, error_message, payload_preview, created_at
      FROM webhook_logs
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return NextResponse.json({
      logs: logs.rows,
    });
  } catch (error) {
    console.error("Webhook details error:", error);
    return NextResponse.json({
      error: "Internal error",
      message: (error as Error).message,
    }, { status: 500 });
  }
}
