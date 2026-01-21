import { NextRequest, NextResponse } from "next/server";
import { fetchOrderDetails, pickOrderFields, needsOrderEnrichment, extractTransactionRef, extractDeliveryMethodFromOrder, fetchTransactionRefForOrder, fetchPaymentRecordForOrder, fetchOrderTransactionsForOrder, extractPaymentSummaryFromPayment } from "@/lib/wix";
import { initDb } from "@/lib/db";
import { upsertTenantOrder, TenantOrder, tenantTablesExist, createTenantTables } from "@/lib/tenant-db";

export async function POST(request: NextRequest) {
  const { orderId, adminSecret, siteId } = await request.json();

  // Verify admin secret
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  // Use provided siteId or fallback to default
  const targetSiteId = siteId || process.env.WIX_SITE_ID || null;

  await initDb();

  try {
    console.log("Syncing order", orderId, "for site", targetSiteId);

    // Fetch order from Wix
    const rawOrder = await fetchOrderDetails({ orderId, siteId: targetSiteId, instanceId: null });

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

    // Ensure siteId is set
    if (!mapped.siteId && targetSiteId) {
      mapped.siteId = targetSiteId;
    }

    if (!mapped.siteId) {
      return NextResponse.json({ error: "Missing siteId - cannot sync order" }, { status: 400 });
    }

    // Ensure tenant tables exist
    const tablesExist = await tenantTablesExist(mapped.siteId);
    if (!tablesExist) {
      await createTenantTables(mapped.siteId);
    }

    // Upsert to tenant-specific table
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
      source: "webhook",
      isSynced: true,
      raw: orderRaw,
    };

    await upsertTenantOrder(mapped.siteId, tenantOrder);
    console.log("✅ Order synced to tenant table:", mapped.number);

    return NextResponse.json({
      success: true,
      order: {
        id: mapped.id,
        number: mapped.number,
        status: mapped.status,
        paymentStatus: mapped.paymentStatus,
        archived: orderRaw?.archived ?? false,
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
