import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

// Helper to extract payment method from raw order data
function extractPaymentMethod(raw: any): { method: "card" | "cod" | "other"; debug: string } {
  if (!raw) return { method: "other", debug: "no raw data" };

  // Check orderTransactions payments
  const payments = raw?.orderTransactions?.payments ?? raw?.payments ?? [];

  if (payments.length === 0) {
    return { method: "other", debug: "no payments array found" };
  }

  for (const payment of payments) {
    // Check for offline payment (COD)
    if (payment?.regularPaymentDetails?.offlinePayment === true) {
      return { method: "cod", debug: "regularPaymentDetails.offlinePayment=true" };
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
      return { method: "cod", debug: `method string contains offline/cash/cod: "${method}"` };
    }
    if (methodStr.includes("card") || methodStr.includes("credit") || methodStr.includes("debit") || methodStr.includes("stripe")) {
      return { method: "card", debug: `method string contains card/credit/debit/stripe: "${method}"` };
    }

    return { method: "other", debug: `unrecognized method: "${method}", payment keys: ${Object.keys(payment).join(", ")}` };
  }

  return { method: "other", debug: "fell through all checks" };
}

export async function GET(request: Request) {
  await initDb();

  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;

  if (!siteId) {
    return NextResponse.json({ ok: false, error: "Missing site id" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get("year") || "2025");
  const month = parseInt(searchParams.get("month") || "12");

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  try {
    const receiptsResult = await sql`
      SELECT
        r.id as receipt_id,
        r.type,
        o.id as order_id,
        o.number as order_number,
        o.total,
        o.currency,
        o.raw
      FROM receipts r
      JOIN orders o ON r.order_id = o.id
      WHERE o.site_id = ${siteId}
        AND r.type = 'sale'
        AND r.issued_at >= ${startDate.toISOString()}
        AND r.issued_at <= ${endDate.toISOString()}
    `;

    const results = receiptsResult.rows.map(row => {
      const { method, debug } = extractPaymentMethod(row.raw);
      return {
        receiptId: row.receipt_id,
        orderNumber: row.order_number,
        total: row.total,
        currency: row.currency,
        paymentMethod: method,
        debug,
        // Show relevant payment info from raw
        paymentInfo: {
          orderTransactionsPayments: row.raw?.orderTransactions?.payments?.map((p: any) => ({
            regularPaymentDetails: p?.regularPaymentDetails,
            paymentMethod: p?.paymentMethod,
            method: p?.method,
          })),
          payments: row.raw?.payments?.map((p: any) => ({
            regularPaymentDetails: p?.regularPaymentDetails,
            paymentMethod: p?.paymentMethod,
            method: p?.method,
          })),
        },
      };
    });

    // Filter to show only "other" method
    const otherOnly = results.filter(r => r.paymentMethod === "other");

    return NextResponse.json({
      ok: true,
      period: `${year}-${month}`,
      totalReceipts: results.length,
      otherCount: otherOnly.length,
      otherReceipts: otherOnly,
      allReceipts: results,
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
