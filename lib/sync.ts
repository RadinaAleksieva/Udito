import { getCompanyBySite } from "@/lib/db";
import { issueReceipt } from "@/lib/receipts";
import {
  upsertTenantOrder,
  updateTenantSyncState,
  TenantOrder,
} from "@/lib/tenant-db";
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
  offset?: number | null; // Support offset-based pagination
};

export async function syncOrdersForSite(params: SyncParams) {
  const { siteId, instanceId, startDateIso, limit, maxPages, paidOnly } = params;
  // Use offset-based pagination (cursor doesn't work reliably with Wix API)
  let currentOffset = params.offset ?? (params.cursor ? parseInt(params.cursor, 10) || 0 : 0);
  let total = 0;
  let receiptsIssued = 0;
  let receiptsSkipped = 0;
  let pages = 0;
  let hasMoreData = true;

  const company = await getCompanyBySite(siteId);
  const hasFiscalCode = Boolean(company?.store_id);

  await updateTenantSyncState(siteId, {
    cursor: String(currentOffset),
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

  const runPage = async (offset: number): Promise<{ nextOffset: number; hasMore: boolean }> => {
    const page = await queryOrders({
      startDateIso,
      offset,
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
      const statusText = (mapped.status || "").toLowerCase();
      if (
        (mapped.paymentStatus || "").toUpperCase() === "PAID" &&
        !statusText.includes("cancel")
      ) {
        const receiptTxRef = extractTransactionRef(orderRaw);

        // CRITICAL: Backfill should NEVER auto-issue receipts for OLD orders!
        // Only issue receipts for orders paid in the CURRENT MONTH
        // This prevents creating invisible receipts for old orders while still allowing recovery from webhook failures
        const orderPaidAt = mapped.paidAt ? new Date(mapped.paidAt) : null;
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const isCurrentMonth = orderPaidAt && orderPaidAt >= currentMonthStart;

        // STRICT CHECK: Only issue receipts for orders paid on or after the receipts start date
        // If no receipts_start_date is configured, use a far-future date to prevent any receipts
        const receiptsStartDate = company?.receipts_start_date
          ? new Date(company.receipts_start_date)
          : new Date("2099-01-01T00:00:00Z"); // Far future = no receipts if not configured
        const isAfterStartDate = orderPaidAt && orderPaidAt >= receiptsStartDate;

        // Skip zero-value orders
        const orderTotal = Number(mapped.total) || 0;
        const hasValue = orderTotal > 0;

        // Log skipped receipts for debugging
        if (!isCurrentMonth && hasFiscalCode && receiptTxRef && hasValue) {
          console.log(`⏭️ SKIPPING receipt for order ${mapped.number}: paid ${orderPaidAt?.toISOString()} is from previous month (backfill protection)`);
        } else if (!isAfterStartDate && hasFiscalCode && receiptTxRef && hasValue && isCurrentMonth) {
          console.log(`⏭️ SKIPPING receipt for order ${mapped.number}: paid ${orderPaidAt?.toISOString()} is BEFORE start date ${receiptsStartDate.toISOString()}`);
        }

        // BOTH conditions must be true: recent order AND after start date
        if (hasFiscalCode && receiptTxRef && isAfterStartDate && isCurrentMonth && hasValue) {
          await issueReceipt({
            orderId: mapped.id,
            payload: mapped,
            businessId: null,
            issuedAt: new Date().toISOString(), // Use CURRENT time, not order's paid_at
            siteId: siteIdResolved, // Required for tenant tables
          });
          receiptsIssued += 1;
        } else {
          receiptsSkipped += 1;
        }
      }
      total += 1;
    }
    return { nextOffset: page.nextOffset ?? offset + orders.length, hasMore: page.hasMore ?? false };
  };

  // Use offset-based pagination loop
  while (hasMoreData && pages < maxPages) {
    const result = await runPage(currentOffset);
    currentOffset = result.nextOffset;
    hasMoreData = result.hasMore;
    pages += 1;
  }

  // Store offset as cursor for backwards compatibility
  const finalCursor = hasMoreData ? String(currentOffset) : null;

  await updateTenantSyncState(siteId, {
    cursor: finalCursor,
    status: finalCursor ? "partial" : "done",
    lastError: null,
  });

  return { cursor: finalCursor, total, pages, receiptsIssued, receiptsSkipped };
}
