import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

// Official EUR/BGN conversion rate
const BGN_TO_EUR = 0.51129;

// Helper to extract payment method from raw order data
function extractPaymentMethod(raw: any): { method: "card" | "cod" | "other"; label: string } {
  if (!raw) return { method: "other", label: "Друг" };

  // Check orderTransactions payments first
  const payments = raw?.orderTransactions?.payments ?? raw?.payments ?? [];
  for (const payment of payments) {
    // Check for offline payment (COD)
    if (payment?.regularPaymentDetails?.offlinePayment === true) {
      return { method: "cod", label: "Наложен платеж" };
    }
    // Check payment method
    const method =
      payment?.regularPaymentDetails?.paymentMethod ??
      payment?.paymentMethod ??
      payment?.method?.type ??
      payment?.method?.name ??
      "";
    const methodStr = String(method).toLowerCase();
    if (methodStr.includes("offline") || methodStr.includes("cash") || methodStr.includes("cod") || methodStr.includes("наложен")) {
      return { method: "cod", label: "Наложен платеж" };
    }
    if (methodStr.includes("card") || methodStr.includes("credit") || methodStr.includes("debit") || methodStr.includes("stripe") || methodStr.includes("карта")) {
      return { method: "card", label: "Карта" };
    }
  }

  // Fallback: check payment_status field from DB (stored as paymentStatus in raw)
  const paymentStatus = raw?.paymentStatus ?? "";
  if (typeof paymentStatus === "string") {
    const statusLower = paymentStatus.toLowerCase();
    if (statusLower.includes("offline")) return { method: "cod", label: "Наложен платеж" };
  }

  // Check if there's any payment info that suggests offline
  const channelInfo = raw?.channelInfo ?? {};
  const externalOrderId = channelInfo?.externalOrderId ?? "";
  if (externalOrderId && typeof externalOrderId === "string" && externalOrderId.toLowerCase().includes("cod")) {
    return { method: "cod", label: "Наложен платеж" };
  }

  // If we have payments but couldn't identify method, default based on common patterns
  if (payments.length > 0) {
    // If there's a transaction with amount, likely it's card
    const hasTransaction = payments.some((p: any) => p?.regularPaymentDetails?.providerTransactionId || p?.transactionId);
    if (hasTransaction) {
      return { method: "card", label: "Карта" };
    }
  }

  return { method: "other", label: "Друг" };
}

// Helper to extract customer name from raw order data
function extractCustomerName(raw: any): string {
  const buyer = raw?.buyerInfo ?? raw?.buyer ?? raw?.customerInfo ?? raw?.customer ?? {};
  const billing = raw?.billingInfo?.contactDetails ?? raw?.billingInfo?.address ?? raw?.billingInfo ?? {};
  const recipient = raw?.recipientInfo?.contactDetails ?? raw?.recipientInfo ?? {};

  const first = buyer?.firstName ?? buyer?.givenName ?? billing?.firstName ?? recipient?.firstName ?? "";
  const last = buyer?.lastName ?? buyer?.familyName ?? billing?.lastName ?? recipient?.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || "—";
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
        r.issued_at,
        o.number as order_number,
        o.customer_name,
        o.total,
        o.tax_total,
        o.shipping_total,
        o.discount_total,
        o.currency,
        o.raw
      FROM receipts r
      JOIN orders o ON r.order_id = o.id
      WHERE (o.site_id = ${siteId} OR o.site_id IS NULL)
        AND r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
      ORDER BY r.issued_at ASC
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

    // Build receipts list for detailed view
    const receiptsList: Array<{
      receiptId: number;
      orderNumber: string;
      customerName: string;
      total: number;
      paymentMethod: string;
      paymentMethodKey: string;
      issuedAt: string;
    }> = [];

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

      // Extract payment method from raw data
      const { method: paymentMethodKey, label: paymentMethodLabel } = extractPaymentMethod(row.raw);

      if (row.type === "sale") {
        totalReceipts++;
        totalRevenue += orderTotal * rate;
        totalTax += orderTax * rate;
        totalShipping += orderShipping * rate;
        totalDiscounts += orderDiscount * rate;

        paymentMethodStats[paymentMethodKey].count++;
        paymentMethodStats[paymentMethodKey].amount += orderTotal * rate;

        // Add to receipts list
        receiptsList.push({
          receiptId: row.id,
          orderNumber: row.order_number || "—",
          customerName: row.customer_name || extractCustomerName(row.raw),
          total: orderTotal * rate,
          paymentMethod: paymentMethodLabel,
          paymentMethodKey: paymentMethodKey,
          issuedAt: row.issued_at,
        });
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
        // Detailed receipts list
        receipts: receiptsList,
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
