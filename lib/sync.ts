import { getCompanyBySite, upsertOrder, upsertSyncState } from "@/lib/db";
import { issueReceipt } from "@/lib/receipts";
import {
  extractDeliveryMethodFromOrder,
  extractPaidAtFromPayment,
  extractPaymentId,
  extractPaymentSummaryFromPayment,
  extractTransactionRef,
  extractTransactionRefFromPayment,
  fetchAllSitePayments,
  fetchOrderDetails,
  fetchPaymentDetailsById,
  fetchPaymentRecordForOrder,
  fetchTransactionRefForOrder,
  findPaymentForOrder,
  needsOrderEnrichment,
  pickOrderFields,
  queryOrders,
} from "@/lib/wix";

type SyncParams = {
  siteId: string;
  instanceId: string | null;
  startDateIso: string;
  limit: number;
  maxPages: number;
  paidOnly: boolean;
  cursor: string | null;
};

export async function syncOrdersForSite(params: SyncParams) {
  const { siteId, instanceId, startDateIso, limit, maxPages, paidOnly } = params;
  let cursor = params.cursor ?? null;
  let total = 0;
  let receiptsIssued = 0;
  let receiptsSkipped = 0;
  let pages = 0;

  const company = await getCompanyBySite(siteId);
  const hasFiscalCode = Boolean(company?.fiscal_store_id);

  await upsertSyncState({
    siteId,
    cursor,
    status: "running",
    lastError: null,
  });

  // Pre-fetch all payment data for the site (batch operation for efficiency)
  let allPayments: any[] | null = null;
  try {
    allPayments = await fetchAllSitePayments({
      siteId,
      instanceId,
      limit: 500,
    });
  } catch (e) {
    console.warn("Could not fetch batch payments:", e);
  }

  const runPage = async (pageCursor: string | null) => {
    const page = await queryOrders({
      startDateIso,
      cursor: pageCursor,
      limit,
      siteId,
      instanceId,
      paymentStatus: paidOnly ? "PAID" : null,
    });
    const orders = page.orders || [];
    for (const rawItem of orders) {
      const raw = rawItem as any;
      const base = pickOrderFields(raw, "backfill");
      if (!base.id) continue;
      let orderRaw: any = raw;
      if (needsOrderEnrichment(raw)) {
        const enriched = await fetchOrderDetails({
          orderId: base.id,
          siteId: base.siteId ?? siteId ?? null,
          instanceId,
        });
        if (enriched) {
          orderRaw = { ...(raw || {}), ...(enriched as any) };
        }
      }
      const deliveryMethod = extractDeliveryMethodFromOrder(orderRaw);
      if (deliveryMethod) {
        orderRaw = {
          ...orderRaw,
          udito: {
            ...(orderRaw.udito ?? {}),
            deliveryMethod,
          },
        };
      }
      let transactionRef = extractTransactionRef(orderRaw);
      let paymentSummary = orderRaw?.udito?.paymentSummary ?? null;
      let paidAtFromRaw = orderRaw?.udito?.paidAt ?? null;

      // Try batch payment data first (most efficient)
      if (allPayments && (!transactionRef || !paymentSummary)) {
        const batchPayment = findPaymentForOrder(allPayments, base.id);
        if (batchPayment) {
          const batchTxRef = extractTransactionRefFromPayment(batchPayment);
          const batchPaidAt = extractPaidAtFromPayment(batchPayment);
          const batchSummary = extractPaymentSummaryFromPayment(batchPayment);
          if (batchTxRef || batchSummary || batchPaidAt) {
            transactionRef = batchTxRef ?? transactionRef;
            paymentSummary = batchSummary ?? paymentSummary;
            paidAtFromRaw = batchPaidAt ?? paidAtFromRaw;
            orderRaw = {
              ...orderRaw,
              udito: {
                ...(orderRaw.udito ?? {}),
                ...(batchTxRef ? { transactionRef: batchTxRef } : {}),
                ...(batchPaidAt ? { paidAt: batchPaidAt } : {}),
                ...(batchSummary ? { paymentSummary: batchSummary } : {}),
              },
            };
          }
        }
      }

      // Fallback: fetch transaction ref individually
      if (!transactionRef) {
        transactionRef = await fetchTransactionRefForOrder({
          orderId: base.id,
          siteId: base.siteId ?? siteId ?? null,
          instanceId,
        });
        if (transactionRef) {
          orderRaw = {
            ...orderRaw,
            udito: { ...(orderRaw.udito ?? {}), transactionRef },
          };
        }
      }
      if (!transactionRef || !paymentSummary || !paidAtFromRaw) {
        let paymentId = extractPaymentId(orderRaw);
        let paymentRef: string | null = null;
        let paidAt: string | null = null;
        if (!paymentId) {
          const record = await fetchPaymentRecordForOrder({
            orderId: base.id,
            orderNumber: base.number ?? null,
            siteId: base.siteId ?? siteId ?? null,
            instanceId,
          });
          paymentId = record.paymentId;
          paymentRef = record.transactionRef;
          paidAt = record.paidAt;
          paymentSummary = paymentSummary ?? record.paymentSummary ?? null;
          if (record.payment) {
            orderRaw = { ...orderRaw, payment: record.payment };
          }
          if (paidAt || paymentSummary) {
            orderRaw = {
              ...orderRaw,
              udito: {
                ...(orderRaw.udito ?? {}),
                ...(paidAt ? { paidAt } : {}),
                ...(paymentSummary ? { paymentSummary } : {}),
              },
            };
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
            siteId: base.siteId ?? siteId ?? null,
            instanceId,
          });
          const paymentRef = extractTransactionRefFromPayment(payment);
          const paidAt = extractPaidAtFromPayment(payment);
          const paymentSummary = extractPaymentSummaryFromPayment(payment);
          if (paidAt || paymentRef || paymentSummary) {
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
      if (!mapped.id) continue;
      const siteIdResolved = mapped.siteId ?? siteId ?? null;
      await upsertOrder({
        ...mapped,
        siteId: siteIdResolved,
        businessId: null,
        raw: orderRaw,
      });
      const statusText = (mapped.status || "").toLowerCase();
      if (
        (mapped.paymentStatus || "").toUpperCase() === "PAID" &&
        !statusText.includes("cancel")
      ) {
        const receiptTxRef = extractTransactionRef(orderRaw);
        if (hasFiscalCode && receiptTxRef) {
          await issueReceipt({
            orderId: mapped.id,
            payload: mapped,
            businessId: null,
            issuedAt: mapped.paidAt ?? mapped.createdAt ?? null,
          });
          receiptsIssued += 1;
        } else {
          receiptsSkipped += 1;
        }
      }
      total += 1;
    }
    return page.cursor ?? null;
  };

  do {
    cursor = await runPage(cursor);
    pages += 1;
  } while (cursor && pages < maxPages);

  await upsertSyncState({
    siteId,
    cursor,
    status: cursor ? "partial" : "done",
    lastError: null,
  });

  return { cursor, total, pages, receiptsIssued, receiptsSkipped };
}
