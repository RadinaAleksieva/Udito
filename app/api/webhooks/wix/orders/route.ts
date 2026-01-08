import { NextRequest, NextResponse } from "next/server";
import { AppStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";
import { getCompanyBySite, initDb, saveWixTokens, upsertOrder } from "@/lib/db";
import { issueReceipt, issueRefundReceipt, getSaleReceiptByOrderId } from "@/lib/receipts";
import {
  extractTransactionRef,
  extractPaymentId,
  extractPaymentSummaryFromPayment,
  extractPaidAtFromPayment,
  extractTransactionRefFromPayment,
  extractDeliveryMethodFromOrder,
  fetchPaymentDetailsById,
  fetchPaymentIdForOrder,
  fetchPaymentRecordForOrder,
  fetchOrderDetails,
  fetchTransactionRefForOrder,
  needsOrderEnrichment,
  pickOrderFields,
} from "@/lib/wix";
import { getAppInstanceDetails } from "@/lib/wix";

const APP_ID = process.env.WIX_APP_ID || "";
const APP_PUBLIC_KEY = process.env.WIX_APP_PUBLIC_KEY || "";

const wixClient =
  APP_ID && APP_PUBLIC_KEY
    ? createClient({
        auth: AppStrategy({
          appId: APP_ID,
          publicKey: APP_PUBLIC_KEY,
        }),
        modules: { orders },
      })
    : null;

async function handleOrderEvent(event: any) {
  const raw = event?.data ?? {};
  const rawOrder = raw?.order ?? raw;
  const paymentStatus = raw?.paymentStatus ?? rawOrder?.paymentStatus ?? null;

  // Get event timestamp - this is when the payment status actually changed
  const eventTimestamp = event?.metadata?.eventTime ??
    event?.metadata?.dateTime ??
    event?.createdDate ??
    event?.timestamp ??
    null;

  const baseOrder = { ...rawOrder, paymentStatus };
  const base = pickOrderFields(baseOrder, "webhook");
  const orderId = base.id;
  let orderRaw: any = baseOrder;
  if (orderId && needsOrderEnrichment(baseOrder)) {
    const enriched = await fetchOrderDetails({
      orderId,
      siteId: base.siteId ?? raw?.siteId ?? rawOrder?.siteId ?? null,
      instanceId: event?.metadata?.instanceId ?? raw?.instanceId ?? rawOrder?.instanceId ?? null,
    });
    if (enriched) {
      orderRaw = { ...baseOrder, ...enriched };
    }
  }
  let transactionRef = extractTransactionRef(orderRaw);
  let deliveryMethod = extractDeliveryMethodFromOrder(orderRaw);
  if (deliveryMethod) {
    orderRaw = {
      ...orderRaw,
      udito: {
        ...(orderRaw.udito ?? {}),
        deliveryMethod,
      },
    };
  }
  if (orderId && !transactionRef) {
    transactionRef = await fetchTransactionRefForOrder({
      orderId,
      siteId: base.siteId ?? raw?.siteId ?? rawOrder?.siteId ?? null,
      instanceId: event?.metadata?.instanceId ?? raw?.instanceId ?? rawOrder?.instanceId ?? null,
    });
    if (transactionRef) {
      orderRaw = {
        ...orderRaw,
        udito: { ...(orderRaw.udito ?? {}), transactionRef },
      };
    }
  }
  if (orderId) {
    let paymentId = extractPaymentId(orderRaw);
    let paymentRef: string | null = null;
    let paidAt: string | null = null;
    let paymentSummary = orderRaw?.udito?.paymentSummary ?? null;
    const record = await fetchPaymentRecordForOrder({
      orderId,
      orderNumber: base.number ?? null,
      siteId: base.siteId ?? raw?.siteId ?? rawOrder?.siteId ?? null,
      instanceId:
        event?.metadata?.instanceId ??
        raw?.instanceId ??
        rawOrder?.instanceId ??
        null,
    });
    paymentId = paymentId ?? record.paymentId ?? null;
    paymentRef = paymentRef ?? record.transactionRef ?? null;
    paidAt = paidAt ?? record.paidAt ?? null;
    paymentSummary = paymentSummary ?? record.paymentSummary ?? null;
    if (record.payment) {
      orderRaw = { ...orderRaw, payment: record.payment };
    }
    if (paymentRef && !transactionRef) {
      transactionRef = paymentRef;
    }
    if ((!paymentSummary || !transactionRef || !paidAt) && paymentId) {
      const payment = await fetchPaymentDetailsById({
        paymentId,
        siteId: base.siteId ?? raw?.siteId ?? rawOrder?.siteId ?? null,
        instanceId:
          event?.metadata?.instanceId ??
          raw?.instanceId ??
          rawOrder?.instanceId ??
          null,
      });
      const paymentRefFromApi = extractTransactionRefFromPayment(payment);
      const paidAtFromApi = extractPaidAtFromPayment(payment);
      const summary = extractPaymentSummaryFromPayment(payment);
      if (!transactionRef && paymentRefFromApi) transactionRef = paymentRefFromApi;
      if (!paidAt && paidAtFromApi) paidAt = paidAtFromApi;
      if (summary) paymentSummary = summary;
    }
    if (transactionRef || paidAt || paymentSummary) {
      orderRaw = {
        ...orderRaw,
        udito: {
          ...(orderRaw.udito ?? {}),
          ...(transactionRef ? { transactionRef } : {}),
          ...(paidAt ? { paidAt } : {}),
          ...(paymentSummary ? { paymentSummary } : {}),
        },
      };
    }
  }
  const mapped = orderRaw === baseOrder ? base : pickOrderFields(orderRaw, "webhook");
  if (!mapped.id) return;
  if (!mapped.siteId) {
    mapped.siteId =
      event?.metadata?.siteId ?? raw?.siteId ?? rawOrder?.siteId ?? null;
  }
  const instanceId =
    event?.metadata?.instanceId ?? raw?.instanceId ?? rawOrder?.instanceId ?? null;
  if (!mapped.siteId && instanceId) {
    try {
      const appInstance = await getAppInstanceDetails({ instanceId });
      mapped.siteId = appInstance?.siteId ?? null;
    } catch (error) {
      console.warn("Wix get app instance failed", error);
    }
  }
  if (mapped.siteId || instanceId) {
    await saveWixTokens({
      businessId: null,
      instanceId: instanceId ?? null,
      siteId: mapped.siteId ?? null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });
  }
  // Use event timestamp as paidAt when order is marked as PAID
  // This is more accurate than the payment record's createdDate
  const isPaid = (mapped.paymentStatus || "").toUpperCase() === "PAID";
  const effectivePaidAt = isPaid && eventTimestamp
    ? eventTimestamp
    : mapped.paidAt;

  await upsertOrder({
    ...mapped,
    paidAt: effectivePaidAt,
    businessId: null,
    raw: orderRaw,
  });
  const statusText = (mapped.status || "").toLowerCase();
  const company = mapped.siteId ? await getCompanyBySite(mapped.siteId) : null;
  const receiptTxRef = extractTransactionRef(orderRaw);

  // Only issue receipts for orders paid on or after the receipts start date
  // Default: 2026-01-01 (when app was "installed")
  const receiptsStartDate = company?.receipts_start_date
    ? new Date(company.receipts_start_date)
    : new Date("2026-01-01T00:00:00Z");
  const orderPaidAt = effectivePaidAt ? new Date(effectivePaidAt) : null;
  const isAfterStartDate = orderPaidAt && orderPaidAt >= receiptsStartDate;

  // Check for refund scenarios
  const paymentStatusUpper = (mapped.paymentStatus || "").toUpperCase();
  const isRefunded = paymentStatusUpper === "REFUNDED" ||
                     paymentStatusUpper === "PARTIALLY_REFUNDED" ||
                     statusText.includes("refund");

  // Check for refund in activities
  const activities = Array.isArray(orderRaw?.activities) ? orderRaw.activities : [];
  const refundActivity = activities.find(
    (a: any) => a?.type === "ORDER_REFUNDED" ||
                a?.type === "REFUND" ||
                (a?.type || "").toString().includes("REFUND")
  );
  const hasRefundActivity = Boolean(refundActivity);

  // Get refund timestamp
  const refundTimestamp = refundActivity?.createdDate ?? eventTimestamp ?? null;

  if (
    isPaid &&
    !statusText.includes("cancel")
  ) {
    // Skip zero-value orders
    const orderTotal = Number(mapped.total) || 0;
    const hasValue = orderTotal > 0;

    if (company?.fiscal_store_id && receiptTxRef && isAfterStartDate && hasValue) {
      await issueReceipt({
        orderId: mapped.id,
        payload: mapped,
        businessId: null,
        issuedAt: effectivePaidAt ?? mapped.createdAt ?? null,
      });
    } else if (!hasValue) {
      console.warn("Skipping receipt: zero value order", mapped.total);
    } else if (!isAfterStartDate) {
      console.warn("Skipping receipt: order paid before receipts start date", effectivePaidAt);
    } else {
      console.warn("Skipping receipt: missing fiscal store id or transaction ref.");
    }
  }

  // Handle refunds - create сторно бележка (refund receipt)
  if ((isRefunded || hasRefundActivity) && company?.fiscal_store_id) {
    // Check if we have an original sale receipt for this order
    const originalReceipt = await getSaleReceiptByOrderId(mapped.id);

    if (originalReceipt) {
      // Calculate refund amount - use the original total since Wix typically does full refunds
      // For partial refunds, we'd need to extract the actual refund amount from the event
      const refundAmount = Number(mapped.total) || 0;

      if (refundAmount > 0) {
        const result = await issueRefundReceipt({
          orderId: mapped.id,
          payload: {
            ...mapped,
            originalReceiptId: originalReceipt.id,
            refundReason: statusText.includes("cancel") ? "cancelled" : "refunded",
          },
          businessId: null,
          issuedAt: refundTimestamp ?? new Date().toISOString(),
          refundAmount,
        });

        if (result.created) {
          console.log("Refund receipt created for order", mapped.number, "receipt ID:", result.receiptId);
        } else {
          console.log("Refund receipt already exists for order", mapped.number);
        }
      }
    } else {
      console.warn("No original sale receipt found for refund, order:", mapped.number);
    }
  }
}

if (wixClient) {
  wixClient.orders.onOrderCreated(handleOrderEvent);
  wixClient.orders.onOrderPaymentStatusUpdated(handleOrderEvent);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text().catch(() => "");
  if (!wixClient) {
    return NextResponse.json(
      { ok: false, error: "Missing Wix app credentials." },
      { status: 500 }
    );
  }

  await initDb();
  try {
    await wixClient.webhooks.process(rawBody);
  } catch (error) {
    console.error("Wix webhook process failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
