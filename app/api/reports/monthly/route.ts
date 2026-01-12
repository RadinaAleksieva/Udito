import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

// Official EUR/BGN conversion rate
const BGN_TO_EUR = 0.51129;

// Helper to extract payment method from raw order data
function extractPaymentMethod(raw: any): "card" | "cod" | "other" {
  if (!raw) return "other";

  // Check orderTransactions payments
  const payments = raw?.orderTransactions?.payments ?? raw?.payments ?? [];
  for (const payment of payments) {
    // Check for offline payment (COD)
    if (payment?.regularPaymentDetails?.offlinePayment === true) {
      return "cod";
    }
    // Check payment method
    const method =
      payment?.regularPaymentDetails?.paymentMethod ??
      payment?.paymentMethod ??
      payment?.method?.type ??
      payment?.method?.name ??
      "";
    const methodStr = String(method).toLowerCase();
    if (methodStr.includes("offline") || methodStr.includes("cash") || methodStr.includes("cod")) {
      return "cod";
    }
    if (methodStr.includes("card") || methodStr.includes("credit") || methodStr.includes("debit") || methodStr.includes("stripe")) {
      return "card";
    }
  }

  // Fallback: check paymentStatus field patterns
  const paymentStatus = raw?.paymentStatus ?? "";
  if (typeof paymentStatus === "string") {
    const statusLower = paymentStatus.toLowerCase();
    if (statusLower.includes("offline")) return "cod";
  }

  return "other";
}

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

  // Determine currency based on date (Bulgaria adopted EUR on Jan 1, 2026)
  const isEurPeriod = year > 2025 || (year === 2025 && month === 12); // Actually Jan 2026+
  const displayCurrency = year >= 2026 ? "EUR" : "BGN";

  try {
    // Get all receipts with order data for the period
    const receiptsResult = await sql`
      SELECT
        r.id,
        r.type,
        r.refund_amount,
        o.total,
        o.tax_total,
        o.shipping_total,
        o.discount_total,
        o.currency,
        o.raw
      FROM receipts r
      JOIN orders o ON r.order_id = o.id
      WHERE o.site_id = ${siteId}
        AND r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
    `;

    // Process receipts and calculate stats
    let totalReceipts = 0;
    let totalRevenue = 0;
    let totalTax = 0;
    let totalShipping = 0;
    let totalDiscounts = 0;
    let totalRefunds = 0;
    let refundAmount = 0;

    const paymentMethodStats: Record<string, { count: number; amount: number }> = {
      card: { count: 0, amount: 0 },
      cod: { count: 0, amount: 0 },
      other: { count: 0, amount: 0 },
    };

    for (const row of receiptsResult.rows) {
      const orderTotal = parseFloat(row.total) || 0;
      const orderTax = parseFloat(row.tax_total) || 0;
      const orderShipping = parseFloat(row.shipping_total) || 0;
      const orderDiscount = parseFloat(row.discount_total) || 0;
      const orderCurrency = row.currency || "EUR";

      // Convert BGN to EUR if needed for display consistency
      const conversionRate = orderCurrency === "BGN" && displayCurrency === "EUR" ? BGN_TO_EUR : 1;
      // Convert EUR to BGN if displaying in BGN
      const reverseRate = orderCurrency === "EUR" && displayCurrency === "BGN" ? 1 / BGN_TO_EUR : 1;
      const rate = orderCurrency === displayCurrency ? 1 : (orderCurrency === "BGN" ? conversionRate : reverseRate);

      if (row.type === "sale") {
        totalReceipts++;
        totalRevenue += orderTotal * rate;
        totalTax += orderTax * rate;
        totalShipping += orderShipping * rate;
        totalDiscounts += orderDiscount * rate;

        // Extract payment method from raw data
        const paymentMethod = extractPaymentMethod(row.raw);
        paymentMethodStats[paymentMethod].count++;
        paymentMethodStats[paymentMethod].amount += orderTotal * rate;
      } else if (row.type === "refund") {
        totalRefunds++;
        const refund = parseFloat(row.refund_amount) || 0;
        refundAmount += refund * rate;
      }
    }

    const avgOrderValue = totalReceipts > 0 ? totalRevenue / totalReceipts : 0;

    return NextResponse.json({
      ok: true,
      stats: {
        year,
        month,
        currency: displayCurrency,
        // Sales
        totalReceipts,
        totalRevenue,
        totalTax,
        totalShipping,
        totalDiscounts,
        avgOrderValue,
        // Net (without tax)
        netRevenue: totalRevenue - totalTax,
        // Refunds
        totalRefunds,
        refundAmount,
        // Final
        finalRevenue: totalRevenue - refundAmount,
        // Payment methods breakdown
        paymentMethods: [
          { method: "card", label: "Карта", count: paymentMethodStats.card.count, amount: paymentMethodStats.card.amount },
          { method: "cod", label: "Наложен платеж", count: paymentMethodStats.cod.count, amount: paymentMethodStats.cod.amount },
          ...(paymentMethodStats.other.count > 0 ? [{ method: "other", label: "Друг", count: paymentMethodStats.other.count, amount: paymentMethodStats.other.amount }] : []),
        ].filter(pm => pm.count > 0),
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
