import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { initDb } from "@/lib/db";
import { getSchemaForSite, upsertTenantOrder } from "@/lib/tenant-db";
import {
  extractPaymentId,
  extractPaymentSummaryFromPayment,
  extractPaidAtFromPayment,
  extractTransactionRef,
  extractTransactionRefFromPayment,
  fetchPaymentDetailsById,
  fetchPaymentRecordForOrder,
} from "@/lib/wix";

function requireSecret(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured.");
  }
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    throw new Error("Unauthorized.");
  }
}

export async function POST(request: Request) {
  try {
    requireSecret(request);
    await initDb();

    const url = new URL(request.url);
    const siteId = url.searchParams.get("siteId");
    const limit = Number(url.searchParams.get("limit") || 200);
    const cursor = url.searchParams.get("cursor");
    if (!siteId) {
      return NextResponse.json(
        { ok: false, error: "Missing siteId." },
        { status: 400 }
      );
    }

    // Get tenant schema
    const schema = await getSchemaForSite(siteId);
    if (!schema) {
      return NextResponse.json(
        { ok: false, error: `No tenant schema found for site ${siteId}` },
        { status: 404 }
      );
    }

    // Query orders from tenant schema that are missing payment info
    const result = await sql.query(`
      SELECT id, number, payment_status, raw
      FROM "${schema}".orders
      WHERE payment_status = 'PAID'
        AND (
          (raw->'udito'->>'transactionRef') IS NULL
          OR (raw->'udito'->>'paidAt') IS NULL
        )
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    console.log(`[sync-payments] Found ${result.rows.length} orders missing payment info in ${schema}`);

    let updated = 0;
    let errors = 0;

    for (const row of result.rows) {
      try {
        const orderId = row.id as string;
        const orderNumber = row.number as string | null;
        let raw = (row.raw ?? {}) as any;
        let transactionRef = extractTransactionRef(raw);
        let paidAt = raw?.udito?.paidAt ?? null;
        let paymentSummary = raw?.udito?.paymentSummary ?? null;

        if (!transactionRef || !paidAt) {
          const record = await fetchPaymentRecordForOrder({
            orderId,
            orderNumber,
            siteId,
          });
          if (record.transactionRef) {
            transactionRef = record.transactionRef;
          }
          if (record.paidAt) {
            paidAt = record.paidAt;
          }
          if (record.paymentSummary) {
            paymentSummary = paymentSummary ?? record.paymentSummary;
          }
          if (record.payment) {
            raw = { ...raw, payment: record.payment };
          }
          let paymentId = record.paymentId ?? extractPaymentId(raw);
          if ((!transactionRef || !paidAt) && paymentId) {
            const payment = await fetchPaymentDetailsById({
              paymentId,
              siteId,
            });
            const paymentRef = extractTransactionRefFromPayment(payment);
            const paymentPaidAt = extractPaidAtFromPayment(payment);
            const summaryFromPayment = extractPaymentSummaryFromPayment(payment);
            if (paymentRef) transactionRef = paymentRef;
            if (paymentPaidAt) paidAt = paymentPaidAt;
            if (summaryFromPayment) {
              paymentSummary = summaryFromPayment;
            }
          }
        }

        if (transactionRef || paidAt || paymentSummary) {
          raw = {
            ...raw,
            udito: {
              ...(raw.udito ?? {}),
              ...(transactionRef ? { transactionRef } : {}),
              ...(paidAt ? { paidAt } : {}),
              ...(paymentSummary ? { paymentSummary } : {}),
            },
          };

          // Update in tenant schema
          await upsertTenantOrder(siteId, {
            id: orderId,
            number: orderNumber,
            status: row.status,
            paymentStatus: row.payment_status,
            paidAt: paidAt,
            raw,
          });
          updated += 1;
          console.log(`[sync-payments] Updated order ${orderNumber || orderId} with transactionRef: ${transactionRef}`);
        }
      } catch (orderError) {
        console.error(`[sync-payments] Error processing order ${row.number || row.id}:`, orderError);
        errors += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      found: result.rows.length,
      updated,
      errors,
      schema,
      next: cursor ?? null
    });
  } catch (error) {
    console.error("Sync payments failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
