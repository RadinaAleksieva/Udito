import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

// Official EUR/BGN conversion rate
const BGN_TO_EUR = 0.51129;

export async function GET(request: Request) {
  await initDb();

  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;

  if (!siteId) {
    return NextResponse.json(
      { ok: false, error: "Missing Wix site id." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());
  const month = parseInt(searchParams.get("month") || (new Date().getMonth() + 1).toString());

  // Create date range for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  try {
    // Get sale receipts stats by joining with orders (convert BGN to EUR)
    const salesResult = await sql`
      SELECT
        COUNT(*) as total_receipts,
        COALESCE(SUM(
          CASE WHEN o.currency = 'BGN' THEN o.total * ${BGN_TO_EUR} ELSE o.total END
        ), 0) as total_revenue,
        COALESCE(SUM(
          CASE WHEN o.currency = 'BGN' THEN o.tax_total * ${BGN_TO_EUR} ELSE o.tax_total END
        ), 0) as total_tax,
        COALESCE(SUM(
          CASE WHEN o.currency = 'BGN' THEN o.shipping_total * ${BGN_TO_EUR} ELSE o.shipping_total END
        ), 0) as total_shipping,
        COALESCE(SUM(
          CASE WHEN o.currency = 'BGN' THEN o.discount_total * ${BGN_TO_EUR} ELSE o.discount_total END
        ), 0) as total_discounts,
        COALESCE(AVG(
          CASE WHEN o.currency = 'BGN' THEN o.total * ${BGN_TO_EUR} ELSE o.total END
        ), 0) as avg_order_value
      FROM receipts r
      JOIN orders o ON r.order_id = o.id
      WHERE o.site_id = ${siteId}
        AND r.type = 'sale'
        AND r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
    `;

    // Get refund receipts stats (convert BGN to EUR)
    const refundsResult = await sql`
      SELECT
        COUNT(*) as total_refunds,
        COALESCE(SUM(
          CASE WHEN o.currency = 'BGN' THEN r.refund_amount * ${BGN_TO_EUR} ELSE r.refund_amount END
        ), 0) as refund_amount
      FROM receipts r
      JOIN orders o ON r.order_id = o.id
      WHERE o.site_id = ${siteId}
        AND r.type = 'refund'
        AND r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
    `;

    // Get payment method breakdown from orders (convert BGN to EUR)
    const paymentMethodsResult = await sql`
      SELECT
        COALESCE(o.payment_status, 'unknown') as method,
        COUNT(*) as count,
        COALESCE(SUM(
          CASE WHEN o.currency = 'BGN' THEN o.total * ${BGN_TO_EUR} ELSE o.total END
        ), 0) as amount
      FROM receipts r
      JOIN orders o ON r.order_id = o.id
      WHERE o.site_id = ${siteId}
        AND r.type = 'sale'
        AND r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
      GROUP BY o.payment_status
      ORDER BY amount DESC
    `;

    // Get daily breakdown for chart (convert BGN to EUR)
    const dailyResult = await sql`
      SELECT
        DATE(r.issued_at) as date,
        COUNT(*) as receipts,
        COALESCE(SUM(
          CASE WHEN o.currency = 'BGN' THEN o.total * ${BGN_TO_EUR} ELSE o.total END
        ), 0) as revenue
      FROM receipts r
      JOIN orders o ON r.order_id = o.id
      WHERE o.site_id = ${siteId}
        AND r.type = 'sale'
        AND r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
      GROUP BY DATE(r.issued_at)
      ORDER BY date
    `;

    const sales = salesResult.rows[0];
    const refunds = refundsResult.rows[0];

    const totalRevenue = parseFloat(sales.total_revenue) || 0;
    const totalTax = parseFloat(sales.total_tax) || 0;
    const totalShipping = parseFloat(sales.total_shipping) || 0;
    const totalDiscounts = parseFloat(sales.total_discounts) || 0;
    const refundAmount = parseFloat(refunds.refund_amount) || 0;

    return NextResponse.json({
      ok: true,
      stats: {
        year,
        month,
        // Sales
        totalReceipts: parseInt(sales.total_receipts) || 0,
        totalRevenue,
        totalTax,
        totalShipping,
        totalDiscounts,
        avgOrderValue: parseFloat(sales.avg_order_value) || 0,
        // Net (without tax)
        netRevenue: totalRevenue - totalTax,
        // Refunds
        totalRefunds: parseInt(refunds.total_refunds) || 0,
        refundAmount,
        // Final
        finalRevenue: totalRevenue - refundAmount,
        // Breakdowns
        paymentMethods: paymentMethodsResult.rows.map(row => ({
          method: row.method,
          count: parseInt(row.count),
          amount: parseFloat(row.amount) || 0,
        })),
        dailyBreakdown: dailyResult.rows.map(row => ({
          date: row.date,
          receipts: parseInt(row.receipts),
          revenue: parseFloat(row.revenue) || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching monthly stats:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}
