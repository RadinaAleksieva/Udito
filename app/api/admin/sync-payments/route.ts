import { NextResponse } from "next/server";
import { sql } from "@/lib/supabase-sql";
import { initDb, upsertOrder } from "@/lib/db";
import {
  extractPaymentId,
  extractPaymentSummaryFromPayment,
  extractPaidAtFromPayment,
  extractTransactionRef,
  extractTransactionRefFromPayment,
  fetchPaymentDetailsById,
  fetchPaymentRecordForOrder,
  pickOrderFields,
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

    const result = await sql`
      select id, number, raw
      from orders
      where site_id = ${siteId}
        and (
          paid_at is null
          or (raw->'udito'->>'transactionRef') is null
          or (raw->'udito'->>'paidAt') is null
        )
      order by created_at desc
      limit ${limit};
    `;

    let updated = 0;
    for (const row of result.rows) {
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
          const paymentSummary = extractPaymentSummaryFromPayment(payment);
          if (paymentRef) transactionRef = paymentRef;
          if (paymentPaidAt) paidAt = paymentPaidAt;
          if (paymentSummary) {
            raw = {
              ...raw,
              udito: {
                ...(raw.udito ?? {}),
                paymentSummary,
              },
            };
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
        const mapped = pickOrderFields(raw, "backfill");
        await upsertOrder({
          ...mapped,
          siteId,
          businessId: null,
          raw,
        });
        updated += 1;
      }
    }

    return NextResponse.json({ ok: true, updated, next: cursor ?? null });
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
