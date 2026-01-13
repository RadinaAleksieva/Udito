import { NextResponse } from "next/server";
import { initDb, getCompanyBySite } from "@/lib/db";
import { sql } from "@vercel/postgres";
import { extractTransactionRef } from "@/lib/wix";
import { getActiveWixContext } from "@/lib/wix-context";

/**
 * Debug endpoint to check why a receipt was not issued for an order
 */
export async function GET(request: Request) {
  try {
    await initDb();
    const { siteId, instanceId } = await getActiveWixContext();
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json(
        { ok: false, error: "Missing orderId parameter" },
        { status: 400 }
      );
    }

    // Get order from database
    const orderResult = await sql`
      SELECT id, number, site_id, status, payment_status, total, paid_at, created_at, raw
      FROM orders
      WHERE id = ${orderId}
      LIMIT 1
    `;

    if (orderResult.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Order not found" },
        { status: 404 }
      );
    }

    const order = orderResult.rows[0];
    const raw = order.raw as any;

    // Check if receipt exists
    const receiptResult = await sql`
      SELECT id, issued_at, type, status
      FROM receipts
      WHERE order_id = ${orderId}
    `;

    const receipts = receiptResult.rows;

    // Get company settings
    const company = order.site_id
      ? await getCompanyBySite(order.site_id, instanceId ?? null)
      : null;

    // Run all checks
    const checks = {
      hasReceipt: receipts.length > 0,
      receiptCount: receipts.length,
      receipts: receipts,

      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        paymentStatus: order.payment_status,
        total: order.total,
        paidAt: order.paid_at,
        createdAt: order.created_at,
        siteId: order.site_id,
      },

      conditions: {
        isPaid: order.payment_status === "PAID",
        isNotCancelled: !String(order.status || "").toLowerCase().includes("cancel"),
        hasValue: Number(order.total || 0) > 0,
        hasFiscalStore: Boolean(company?.store_id),
        hasTransactionRef: Boolean(extractTransactionRef(raw)),
        isAfterStartDate: (() => {
          if (!order.paid_at) return false;
          const receiptsStartDate = company?.receipts_start_date
            ? new Date(company.receipts_start_date)
            : new Date("2026-01-01T00:00:00Z");
          const orderPaidAt = new Date(order.paid_at);
          return orderPaidAt >= receiptsStartDate;
        })(),
      },

      company: {
        exists: Boolean(company),
        storeId: company?.store_id ?? null,
        receiptsStartDate: company?.receipts_start_date ?? "2026-01-01T00:00:00Z",
      },

      transactionRef: extractTransactionRef(raw),

      reasons: [] as string[],
    };

    // Determine why receipt was not issued
    if (!checks.conditions.isPaid) {
      checks.reasons.push("❌ Поръчката НЕ е платена (payment_status !== 'PAID')");
    }
    if (!checks.conditions.isNotCancelled) {
      checks.reasons.push("❌ Поръчката е отказана (status съдържа 'cancel')");
    }
    if (!checks.conditions.hasValue) {
      checks.reasons.push("❌ Поръчката няма стойност (total = 0)");
    }
    if (!checks.conditions.hasFiscalStore) {
      checks.reasons.push("❌ Липсва store_id в настройките на компанията");
    }
    if (!checks.conditions.hasTransactionRef) {
      checks.reasons.push("❌ Липсва transaction reference ID в payment данните");
    }
    if (!checks.conditions.isAfterStartDate) {
      checks.reasons.push(`❌ Поръчката е платена ПРЕДИ началната дата (paid_at < receipts_start_date)`);
    }

    // Check if all conditions are met
    const allConditionsMet = Object.values(checks.conditions).every(v => v === true);

    if (allConditionsMet && !checks.hasReceipt) {
      checks.reasons.push("⚠️ ВСИЧКИ условия са изпълнени, но бележката не е издадена! Това е грешка!");
    } else if (allConditionsMet && checks.hasReceipt) {
      checks.reasons.push("✅ Всички условия са изпълнени и бележката Е издадена");
    }

    return NextResponse.json({
      ok: true,
      hasReceipt: checks.hasReceipt,
      shouldHaveReceipt: allConditionsMet,
      checks,
    });

  } catch (error) {
    console.error("Receipt check failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
