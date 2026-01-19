import { NextResponse } from "next/server";
import {
  getCompanyBySite,
  initDb,
} from "@/lib/db";
import { issueReceipt } from "@/lib/receipts";
import {
  upsertTenantOrder,
  TenantOrder,
} from "@/lib/tenant-db";
import {
  extractTransactionRef,
  extractPaymentId,
  extractPaidAtFromPayment,
  extractPaymentSummaryFromPayment,
  extractTransactionRefFromPayment,
  fetchPaymentDetailsById,
  fetchPaymentIdForOrder,
  fetchPaymentRecordForOrder,
  fetchOrderDetails,
  fetchTransactionRefForOrder,
  needsOrderEnrichment,
  pickOrderFields,
  queryPaidOrders,
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

function resolveStartDateIso() {
  const iso = process.env.BACKFILL_START_ISO;
  const date = process.env.BACKFILL_START_DATE;
  const timezone = process.env.TIMEZONE || "Europe/Sofia";

  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }

  if (date) {
    const fallbackIso = `${date}T00:00:00+03:00`;
    const parsed = new Date(fallbackIso);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }

  const now = new Date();
  console.warn(
    "BACKFILL_START_DATE/ISO missing; defaulting to last 30 days.",
    { timezone }
  );
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return last30.toISOString();
}

export async function POST(request: Request) {
  try {
    requireSecret(request);
    await initDb();
    const url = new URL(request.url);
    const siteIdParam = url.searchParams.get("siteId");
    const instanceIdParam = url.searchParams.get("instanceId");
    const company = siteIdParam ? await getCompanyBySite(siteIdParam) : null;
    const hasFiscalCode = Boolean(company?.store_id);

    const startDateIso = resolveStartDateIso();
    const limit = Number(process.env.BACKFILL_PAGE_LIMIT || 100);
    const maxPages = Number(process.env.BACKFILL_MAX_PAGES || 50);

    let cursor: string | null = null;
    let total = 0;
    let receiptsIssued = 0;
    let receiptsSkipped = 0;
    let pages = 0;

    do {
      const page = await queryPaidOrders({
        startDateIso,
        cursor,
        limit,
        siteId: siteIdParam,
        instanceId: instanceIdParam,
      });
      const orders = page.orders || [];
      for (const rawItem of orders) {
        const raw = rawItem as any;
        const base = pickOrderFields(raw, "backfill");
        if (!base.id) {
          continue;
        }
        let orderRaw: any = raw;
        if (needsOrderEnrichment(raw)) {
          const enriched = await fetchOrderDetails({
            orderId: base.id,
            siteId: base.siteId ?? siteIdParam ?? null,
            instanceId: instanceIdParam ?? null,
          });
          if (enriched) {
            orderRaw = { ...(raw || {}), ...(enriched as any) };
          }
        }
        let transactionRef = extractTransactionRef(orderRaw);
        if (!transactionRef) {
          transactionRef = await fetchTransactionRefForOrder({
            orderId: base.id,
            siteId: base.siteId ?? siteIdParam ?? null,
            instanceId: instanceIdParam ?? null,
          });
          if (transactionRef) {
            orderRaw = {
              ...orderRaw,
              udito: { ...(orderRaw.udito ?? {}), transactionRef },
            };
          }
        }
        if (!transactionRef) {
          let paymentId = extractPaymentId(orderRaw);
          let paymentRef: string | null = null;
          let paidAt: string | null = null;
          let paymentSummary = orderRaw?.udito?.paymentSummary ?? null;
          if (!paymentId) {
            const record = await fetchPaymentRecordForOrder({
              orderId: base.id,
              orderNumber: base.number ?? null,
              siteId: base.siteId ?? siteIdParam ?? null,
              instanceId: instanceIdParam ?? null,
            });
            paymentId = record.paymentId;
            paymentRef = record.transactionRef;
            paidAt = record.paidAt;
            paymentSummary = paymentSummary ?? record.paymentSummary ?? null;
            if (record.payment) {
              orderRaw = { ...orderRaw, payment: record.payment };
            }
          }
          if (paymentRef) {
            transactionRef = paymentRef;
            orderRaw = {
              ...orderRaw,
              udito: {
                ...(orderRaw.udito ?? {}),
                transactionRef: paymentRef,
                ...(paidAt ? { paidAt } : {}),
                ...(paymentSummary ? { paymentSummary } : {}),
              },
            };
          }
          if (paymentId) {
            const payment = await fetchPaymentDetailsById({
              paymentId,
              siteId: base.siteId ?? siteIdParam ?? null,
              instanceId: instanceIdParam ?? null,
            });
            const paymentRef = extractTransactionRefFromPayment(payment);
            const paidAt = extractPaidAtFromPayment(payment);
            const paymentSummary = extractPaymentSummaryFromPayment(payment);
            if (paidAt || paymentRef) {
              transactionRef = paymentRef;
              orderRaw = {
                ...orderRaw,
                udito: {
                  ...(orderRaw.udito ?? {}),
                  ...(paymentRef ? { transactionRef: paymentRef } : {}),
                  ...(paidAt ? { paidAt } : {}),
                  ...(paymentSummary ? { paymentSummary } : {}),
                },
              };
            }
          }
        }
        const mapped = orderRaw === raw ? base : pickOrderFields(orderRaw, "backfill");
        const siteIdResolved = mapped.siteId ?? siteIdParam ?? null;
        if (!siteIdResolved) {
          console.warn(`⚠️ Skipping order ${mapped.number}: no siteId`);
          continue;
        }

        // Save to tenant table - synced orders are marked as isSynced=true (not chargeable)
        const tenantOrder: TenantOrder = {
          id: mapped.id,
          number: mapped.number,
          status: mapped.status,
          paymentStatus: mapped.paymentStatus,
          createdAt: mapped.createdAt,
          updatedAt: mapped.updatedAt,
          paidAt: mapped.paidAt,
          currency: mapped.currency,
          subtotal: mapped.subtotal,
          taxTotal: mapped.taxTotal,
          shippingTotal: mapped.shippingTotal,
          discountTotal: mapped.discountTotal,
          total: mapped.total,
          customerEmail: mapped.customerEmail,
          customerName: mapped.customerName,
          source: "backfill",
          isSynced: true, // ✅ Synced order - NOT chargeable
          raw: orderRaw,
        };
        await upsertTenantOrder(siteIdResolved, tenantOrder);

        if ((mapped.paymentStatus || "").toUpperCase() === "PAID") {
          const receiptTxRef = extractTransactionRef(orderRaw);
          if (hasFiscalCode && receiptTxRef) {
            await issueReceipt({
              orderId: mapped.id,
              payload: mapped,
              businessId: null,
              issuedAt: mapped.paidAt ?? mapped.createdAt ?? null,
              siteId: siteIdResolved, // Required for tenant tables
            });
            receiptsIssued += 1;
          } else {
            receiptsSkipped += 1;
          }
        }
        total += 1;
      }
      cursor = page.cursor ?? null;
      pages += 1;
    } while (cursor && pages < maxPages);

    return NextResponse.json({
      ok: true,
      total,
      pages,
      receiptsIssued,
      receiptsSkipped,
      startDateIso,
      cursor: cursor ?? null,
    });
  } catch (error) {
    console.error("Backfill failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
