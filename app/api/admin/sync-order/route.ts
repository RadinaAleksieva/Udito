import { NextRequest, NextResponse } from "next/server";
import { fetchOrderDetails, pickOrderFields, needsOrderEnrichment, extractTransactionRef, extractDeliveryMethodFromOrder, fetchTransactionRefForOrder, fetchPaymentRecordForOrder, fetchOrderTransactionsForOrder, extractPaymentSummaryFromPayment } from "@/lib/wix";
import { initDb, upsertOrder } from "@/lib/db";

export async function POST(request: NextRequest) {
  const { orderId, adminSecret } = await request.json();

  // Verify admin secret
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  await initDb();

  try {
    console.log("Syncing order", orderId);

    // Fetch order from Wix
    const rawOrder = await fetchOrderDetails({ orderId, siteId: null, instanceId: null });

    if (!rawOrder) {
      return NextResponse.json({ error: "Order not found in Wix" }, { status: 404 });
    }

    const base = pickOrderFields(rawOrder, "webhook");
    let orderRaw: any = rawOrder;

    // Extract transaction ref
    let transactionRef = extractTransactionRef(orderRaw);

    // Extract delivery method
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

    // Fetch transaction ref if missing
    if (base.id && !transactionRef) {
      transactionRef = await fetchTransactionRefForOrder({
        orderId: base.id,
        siteId: base.siteId ?? null,
        instanceId: null,
      });
      if (transactionRef) {
        orderRaw = {
          ...orderRaw,
          udito: { ...(orderRaw.udito ?? {}), transactionRef },
        };
      }
    }

    // Fetch payment details
    if (base.id) {
      let paymentRef: string | null = null;
      let paidAt: string | null = null;
      let paymentSummary = orderRaw?.udito?.paymentSummary ?? null;

      const record = await fetchPaymentRecordForOrder({
        orderId: base.id,
        orderNumber: base.number ?? null,
        siteId: base.siteId ?? null,
        instanceId: null,
      });

      paymentRef = paymentRef ?? record.transactionRef ?? null;
      paidAt = paidAt ?? record.paidAt ?? null;
      paymentSummary = paymentSummary ?? record.paymentSummary ?? null;

      if (record.payment) {
        orderRaw = { ...orderRaw, payment: record.payment };
      }

      // Fetch orderTransactions for card details
      if (!orderRaw?.orderTransactions) {
        const orderTx = await fetchOrderTransactionsForOrder({
          orderId: base.id,
          siteId: base.siteId ?? null,
          instanceId: null,
        });
        if (orderTx?.orderTransactions || orderTx?.payments) {
          orderRaw = {
            ...orderRaw,
            orderTransactions: orderTx.orderTransactions ?? { payments: orderTx.payments },
          };
        }
      }

      // Extract paymentSummary from orderTransactions if we have them but no paymentSummary
      if (orderRaw?.orderTransactions?.payments && !paymentSummary) {
        const payments = orderRaw.orderTransactions.payments;
        if (Array.isArray(payments) && payments.length > 0) {
          const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
          const bestPayment = payments.find(
            (p: any) => validStatuses.includes(p?.regularPaymentDetails?.status)
          ) || payments[0];
          const summary = extractPaymentSummaryFromPayment(bestPayment);
          if (summary) paymentSummary = summary;
        }
      }

      if (paymentRef && !transactionRef) {
        transactionRef = paymentRef;
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

    const mapped = pickOrderFields(orderRaw, "webhook");

    // Upsert to database
    await upsertOrder({
      ...mapped,
      businessId: null,
      raw: orderRaw,
    });

    return NextResponse.json({
      success: true,
      order: {
        id: mapped.id,
        number: mapped.number,
        status: mapped.status,
        paymentStatus: mapped.paymentStatus,
      }
    });

  } catch (error) {
    console.error("Error syncing order:", error);
    return NextResponse.json({
      error: "Failed to sync order",
      details: (error as Error).message
    }, { status: 500 });
  }
}
