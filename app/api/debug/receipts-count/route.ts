import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await initDb();

  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "2026");
  const month = parseInt(searchParams.get("month") || "1");

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  try {
    // Count all receipts in period (no join)
    const allReceiptsCount = await sql`
      SELECT COUNT(*) as count FROM receipts
      WHERE issued_at >= ${startDate.toISOString()}
        AND issued_at <= ${endDate.toISOString()}
    `;

    // Count receipts with type='sale' in period
    const saleReceiptsCount = await sql`
      SELECT COUNT(*) as count FROM receipts
      WHERE type = 'sale'
        AND issued_at >= ${startDate.toISOString()}
        AND issued_at <= ${endDate.toISOString()}
    `;

    // Count receipts joined with orders (current query)
    const joinedReceiptsCount = await sql`
      SELECT COUNT(*) as count
      FROM receipts r
      JOIN orders o ON r.order_id = o.id
      WHERE o.site_id = ${siteId}
        AND r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
    `;

    // Count receipts joined with orders WITHOUT site_id filter
    const joinedNoSiteFilter = await sql`
      SELECT COUNT(*) as count
      FROM receipts r
      JOIN orders o ON r.order_id = o.id
      WHERE r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
    `;

    // Count receipts that have NO matching order
    const orphanReceipts = await sql`
      SELECT COUNT(*) as count
      FROM receipts r
      LEFT JOIN orders o ON r.order_id = o.id
      WHERE o.id IS NULL
        AND r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
    `;

    // Get list of all receipts with their order info
    const receiptsList = await sql`
      SELECT
        r.id as receipt_id,
        r.order_id,
        r.type,
        r.issued_at,
        o.id as order_exists,
        o.site_id as order_site_id,
        o.number as order_number
      FROM receipts r
      LEFT JOIN orders o ON r.order_id = o.id
      WHERE r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
      ORDER BY r.issued_at
    `;

    return NextResponse.json({
      ok: true,
      siteId,
      period: `${year}-${month}`,
      counts: {
        allReceipts: parseInt(allReceiptsCount.rows[0].count),
        saleReceipts: parseInt(saleReceiptsCount.rows[0].count),
        joinedWithSiteFilter: parseInt(joinedReceiptsCount.rows[0].count),
        joinedWithoutSiteFilter: parseInt(joinedNoSiteFilter.rows[0].count),
        orphanReceipts: parseInt(orphanReceipts.rows[0].count),
      },
      receipts: receiptsList.rows,
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
