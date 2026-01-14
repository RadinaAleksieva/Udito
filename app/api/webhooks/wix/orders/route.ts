import { NextRequest, NextResponse } from "next/server";
import { AppStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";
import { sql } from "@vercel/postgres";
import { getCompanyBySite, getLatestWixToken, getOrderById, initDb, saveWixTokens, upsertOrder } from "@/lib/db";
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
  fetchOrderTransactionsForOrder,
  needsOrderEnrichment,
  pickOrderFields,
} from "@/lib/wix";
import { getAppInstanceDetails } from "@/lib/wix";

const APP_ID = process.env.WIX_APP_ID || "";
const APP_PUBLIC_KEY = process.env.WIX_APP_PUBLIC_KEY || "";

// Decode Wix instance JWT to extract siteId
function decodeWixInstance(instance: string): { siteId: string | null; instanceId: string | null } {
  try {
    const parts = instance.split(".");
    if (parts.length < 2) return { siteId: null, instanceId: null };

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf-8");
    const payload = JSON.parse(json);

    return {
      siteId: payload?.siteId ?? payload?.sid ?? null,
      instanceId: payload?.instanceId ?? payload?.iid ?? null,
    };
  } catch {
    return { siteId: null, instanceId: null };
  }
}

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
  try {
    console.log("🎯 handleOrderEvent called!");
    console.log("Event type:", event?.metadata?.eventType ?? event?.type ?? "unknown");
    console.log("Event data keys:", Object.keys(event?.data ?? {}));
    console.log("Event metadata:", JSON.stringify(event?.metadata ?? {}, null, 2));

    const raw = event?.data ?? {};
    const rawOrder = raw?.order ?? raw;
    const paymentStatus = raw?.paymentStatus ?? rawOrder?.paymentStatus ?? null;

  // Get event timestamp - this is when the payment status actually changed
  const eventTimestamp = event?.metadata?.eventTime ??
    event?.metadata?.dateTime ??
    event?.createdDate ??
    event?.timestamp ??
    null;

  const baseOrder = {
    ...rawOrder,
    paymentStatus,
    instanceId: event?.metadata?.instanceId ?? raw?.instanceId ?? rawOrder?.instanceId ?? null,
  };
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
    // Fetch full orderTransactions for card details
    // ALWAYS fetch for payment_status_updated events (when order becomes paid)
    const isPaymentStatusUpdate = event?.metadata?.eventType?.includes('payment_status');
    const needsOrderTransactions = !orderRaw?.orderTransactions || isPaymentStatusUpdate;

    if (needsOrderTransactions) {
      console.log(`🔍 Fetching orderTransactions for order ${orderId} (paymentStatusUpdate: ${isPaymentStatusUpdate})`);
      const orderTx = await fetchOrderTransactionsForOrder({
        orderId,
        siteId: base.siteId ?? raw?.siteId ?? rawOrder?.siteId ?? null,
        instanceId:
          event?.metadata?.instanceId ??
          raw?.instanceId ??
          rawOrder?.instanceId ??
          null,
      });
      if (orderTx?.orderTransactions || orderTx?.payments) {
        orderRaw = {
          ...orderRaw,
          orderTransactions: orderTx.orderTransactions ?? { payments: orderTx.payments },
        };
        console.log(`✅ OrderTransactions fetched for order ${orderId}`);
      } else {
        console.log(`⚠️ No orderTransactions found for order ${orderId}`);
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
  console.log("🔄 About to map order...");
  const mapped = orderRaw === baseOrder ? base : pickOrderFields(orderRaw, "webhook");
  console.log("✅ Order mapped successfully");

  console.log("📋 Mapped order:", {
    id: mapped.id,
    number: mapped.number,
    siteId: mapped.siteId,
    status: mapped.status,
    paymentStatus: mapped.paymentStatus,
  });

  if (!mapped.id) {
    console.warn("⚠️ Order has no ID, skipping. Raw order:", JSON.stringify(baseOrder).substring(0, 200));
    return;
  }
  console.log("✅ Order has ID, continuing...", mapped.id);

  console.log("🔄 Step 1: Checking siteId...");
  if (!mapped.siteId) {
    console.log("🔍 Looking for siteId in event metadata...");
    mapped.siteId =
      event?.metadata?.siteId ?? raw?.siteId ?? rawOrder?.siteId ?? null;
    console.log("Found siteId:", mapped.siteId);
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
  console.log("🔄 Step 2: Saving tokens...");
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
  console.log("🔄 Step 3: Calculating isPaid...");
  // Use event timestamp as paidAt when order is marked as PAID
  // This is more accurate than the payment record's createdDate
  const isPaid = (mapped.paymentStatus || "").toUpperCase() === "PAID";
  const effectivePaidAt = isPaid && eventTimestamp
    ? eventTimestamp
    : mapped.paidAt;

  console.log("💾 Saving order to database:", {
    id: mapped.id,
    number: mapped.number,
    siteId: mapped.siteId,
    status: mapped.status,
    paymentStatus: mapped.paymentStatus,
  });

  await upsertOrder({
    ...mapped,
    paidAt: effectivePaidAt,
    businessId: null,
    raw: orderRaw,
  });

  console.log("✅ Order saved successfully:", mapped.number);

  // Read the order back from OUR database for receipt logic
  // This ensures we use the enriched data we've already processed
  const savedOrder = await getOrderById(mapped.id);
  const savedRaw = savedOrder?.raw ?? orderRaw;
  const statusText = (savedOrder?.status || mapped.status || "").toLowerCase();

  // Look up company by either siteId or instanceId (whichever matches)
  let company = (mapped.siteId || instanceId) ? await getCompanyBySite(mapped.siteId, instanceId) : null;

  // Fallback 1: if no siteId/instanceId, try to get from the latest token
  if (!company) {
    const latestToken = await getLatestWixToken();
    if (latestToken) {
      console.log("🔍 Fallback 1: trying company lookup from latest token:", {
        tokenSiteId: latestToken.site_id,
        tokenInstanceId: latestToken.instance_id
      });
      company = await getCompanyBySite(latestToken.site_id, latestToken.instance_id);
    }
  }

  // Fallback 2: if still no company, get the first company with store_id and cod_receipts_enabled
  if (!company) {
    console.log("🔍 Fallback 2: getting first configured company");
    const fallbackResult = await sql`
      SELECT site_id, instance_id, store_name, store_id, cod_receipts_enabled, receipts_start_date
      FROM companies
      WHERE store_id IS NOT NULL
      ORDER BY cod_receipts_enabled DESC, updated_at DESC
      LIMIT 1
    `;
    company = fallbackResult.rows[0] ?? null;
  }

  console.log("🏢 Company lookup:", { siteId: mapped.siteId, instanceId, found: !!company, storeId: company?.store_id });

  // Check if this is a COD (cash on delivery) payment
  // Use savedRaw from database - it has enriched data
  const paymentMethodText = String(
    savedRaw?.udito?.paymentSummary?.methodText ??  // Our enriched data - check first!
    savedRaw?.udito?.paymentSummary?.methodLabel ??
    savedRaw?.paymentMethod?.type ??
    savedRaw?.paymentMethod?.name ??
    savedRaw?.paymentMethodSummary?.type ??
    savedRaw?.paymentMethodSummary?.name ??
    savedRaw?.paymentInfo?.type ??
    savedRaw?.paymentInfo?.name ??
    savedRaw?.billingInfo?.paymentMethod ??
    savedRaw?.channelInfo?.type ??
    ""
  ).toLowerCase();

  // Also check in payments array from database
  const paymentsArray = savedRaw?.orderTransactions?.payments ?? savedRaw?.payments ?? [];
  const firstPayment = Array.isArray(paymentsArray) ? paymentsArray[0] : null;
  const paymentGateway = String(
    firstPayment?.paymentGatewayOrderId ??
    firstPayment?.providerAppId ??
    firstPayment?.regularPaymentDetails?.offlinePayment?.description ??
    firstPayment?.offlinePayment?.description ??
    ""
  ).toLowerCase();

  const isCOD = paymentMethodText.includes("offline") ||
                paymentMethodText.includes("cash") ||
                paymentMethodText.includes("cod") ||
                paymentMethodText.includes("наложен") ||
                paymentGateway.includes("offline") ||
                paymentGateway.includes("cash") ||
                Boolean(firstPayment?.regularPaymentDetails?.offlinePayment) ||
                Boolean(firstPayment?.offlinePayment);

  // Debug logging for payment method detection
  console.log(`💳 Payment method detection for order ${mapped.number}:`, {
    paymentMethodText: paymentMethodText || "(empty)",
    paymentGateway: paymentGateway || "(empty)",
    hasOfflinePayment: Boolean(firstPayment?.regularPaymentDetails?.offlinePayment || firstPayment?.offlinePayment),
    isCOD,
    usingDatabaseRaw: savedOrder !== null,
  });

  // Extract transaction ref from database order (has enriched data)
  const receiptTxRef = extractTransactionRef(savedRaw);

  // Only issue receipts for orders paid on or after the receipts start date
  // Default: 2026-01-01 (when app was "installed")
  // Note: database returns snake_case (receipts_start_date)
  const companyStartDate = company?.receipts_start_date ?? company?.receiptsStartDate ?? null;
  const receiptsStartDate = companyStartDate
    ? new Date(companyStartDate)
    : new Date("2026-01-01T00:00:00Z");
  // For paid orders, use effectivePaidAt or current time as fallback
  // This ensures we can issue receipts even if timestamp is missing
  const orderPaidAt = effectivePaidAt
    ? new Date(effectivePaidAt)
    : (isPaid ? new Date() : null);
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

  // Use payment status from saved order (database) for receipt decision
  const savedPaymentStatus = (savedOrder?.payment_status || mapped.paymentStatus || "").toUpperCase();
  const savedIsPaid = savedPaymentStatus === "PAID";
  const savedPaidAt = savedOrder?.paid_at ?? effectivePaidAt;

  // Recalculate orderPaidAt using saved data
  const finalPaidAt = savedPaidAt
    ? new Date(savedPaidAt)
    : (savedIsPaid ? new Date() : null);
  const finalIsAfterStartDate = finalPaidAt && finalPaidAt >= receiptsStartDate;

  // DEBUG: Log receipt decision factors
  console.log(`📊 Receipt decision for order ${mapped.number}:`, {
    savedPaymentStatus,
    savedIsPaid,
    webhookPaymentStatus: mapped.paymentStatus,
    status: savedOrder?.status || mapped.status,
    statusText,
    isCancelled: statusText.includes("cancel"),
    usingDatabaseData: !!savedOrder,
  });

  if (
    savedIsPaid &&
    !statusText.includes("cancel")
  ) {
    // Skip zero-value orders
    const orderTotal = Number(savedOrder?.total || mapped.total) || 0;
    const hasValue = orderTotal > 0;

    // For COD orders, check if COD receipts are enabled
    // Note: database returns snake_case (cod_receipts_enabled), not camelCase
    const codReceiptsEnabled = company?.cod_receipts_enabled ?? company?.codReceiptsEnabled ?? false;
    const shouldIssueCODReceipt = isCOD && codReceiptsEnabled === true;
    const shouldIssueReceipt = isCOD ? shouldIssueCODReceipt : true;

    // Log all conditions for debugging
    const paidAtSource = savedPaidAt ? 'from database' : (savedIsPaid ? 'using current time (fallback)' : 'not paid');
    console.log(`🧾 Receipt conditions for order ${mapped.number}:`, {
      hasStoreId: !!company?.store_id,
      storeId: company?.store_id ?? "MISSING",
      hasReceiptTxRef: !!receiptTxRef,
      receiptTxRef: receiptTxRef ?? "MISSING",
      isAfterStartDate: finalIsAfterStartDate,
      receiptsStartDate: company?.receipts_start_date ?? "default:2026-01-01",
      orderPaidAt: finalPaidAt?.toISOString() ?? "null",
      paidAtSource,
      savedPaidAt: savedPaidAt ?? "null",
      hasValue,
      orderTotal,
      isCOD,
      shouldIssueReceipt,
      codReceiptsEnabled,
      companyFound: !!company,
      usingDatabaseData: !!savedOrder,
    });

    if (company?.store_id && receiptTxRef && finalIsAfterStartDate && hasValue && shouldIssueReceipt) {
      await issueReceipt({
        orderId: mapped.id,
        payload: savedOrder ?? mapped,
        businessId: null,
        issuedAt: savedPaidAt ?? mapped.createdAt ?? null,
      });
      console.log(`✅ Receipt issued for ${isCOD ? 'COD' : 'card'} payment:`, mapped.number);
    } else if (!hasValue) {
      console.warn("❌ Skipping receipt: zero value order", orderTotal);
    } else if (!finalIsAfterStartDate) {
      console.warn("❌ Skipping receipt: order paid before receipts start date", savedPaidAt);
    } else if (isCOD && !shouldIssueCODReceipt) {
      console.log("❌ Skipping COD receipt: COD receipts are disabled in settings");
    } else {
      console.warn("❌ Skipping receipt: missing fiscal store id or transaction ref.", {
        storeId: company?.store_id,
        receiptTxRef,
      });
    }
  }

  // Handle refunds - create сторно бележка (refund receipt)
  if ((isRefunded || hasRefundActivity) && company?.store_id) {
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
  } catch (error) {
    console.error("❌ Error in handleOrderEvent:");
    console.error("Error message:", (error as Error).message);
    console.error("Error stack:", (error as Error).stack);
    console.error("Full error:", JSON.stringify(error, null, 2));
    throw error; // Re-throw to let webhook handler know it failed
  }
}

if (wixClient) {
  console.log("🔧 Registering webhook handlers...");
  wixClient.orders.onOrderCreated(handleOrderEvent);
  wixClient.orders.onOrderUpdated(handleOrderEvent);
  wixClient.orders.onOrderPaymentStatusUpdated(handleOrderEvent);
  wixClient.orders.onOrderApproved?.(handleOrderEvent);
  wixClient.orders.onOrderCanceled?.(handleOrderEvent);
  console.log("✅ Webhook handlers registered: onOrderCreated, onOrderUpdated, onOrderPaymentStatusUpdated, onOrderApproved, onOrderCanceled");
} else {
  console.error("❌ wixClient not initialized - webhooks will not work!");
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text().catch(() => "");

  // Log all incoming webhooks
  console.log("=== WEBHOOK RECEIVED ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Body length:", rawBody.length);
  console.log("Body preview:", rawBody.substring(0, 200));

  if (!wixClient) {
    console.error("Missing Wix app credentials");
    return NextResponse.json(
      { ok: false, error: "Missing Wix app credentials." },
      { status: 500 }
    );
  }

  await initDb();

  // Decode JWS token manually to extract event data
  // Wix webhooks are sent as JWS (JSON Web Signature) tokens
  let eventData: any = null;
  try {
    // JWS format: header.payload.signature
    const parts = rawBody.split('.');
    if (parts.length === 3) {
      const payload = parts[1];
      const decoded = Buffer.from(payload, 'base64').toString('utf8');
      const parsedPayload = JSON.parse(decoded);
      console.log("📦 Decoded JWS payload:", JSON.stringify(parsedPayload, null, 2).substring(0, 500));
      console.log("📦 parsedPayload keys:", Object.keys(parsedPayload || {}));
      console.log("📦 parsedPayload.instanceId:", parsedPayload?.instanceId);
      console.log("📦 parsedPayload.instance:", parsedPayload?.instance);

      // Extract siteId from the instance JWT token (critical for store identification!)
      const instanceToken = parsedPayload?.instance;
      const decodedInstance = instanceToken ? decodeWixInstance(instanceToken) : null;
      const jwsSiteId = decodedInstance?.siteId ?? parsedPayload?.siteId ?? null;
      console.log("📦 Decoded instance siteId:", jwsSiteId);

      // Extract event data from the payload (handle triple-nested structure)
      if (parsedPayload.data) {
        // First level: parsedPayload.data is a stringified JSON
        const firstParse = typeof parsedPayload.data === 'string'
          ? JSON.parse(parsedPayload.data)
          : parsedPayload.data;

        // Second level: firstParse.data might also be a stringified JSON
        if (firstParse.data && typeof firstParse.data === 'string') {
          eventData = JSON.parse(firstParse.data);
        } else {
          eventData = firstParse;
        }

        console.log("📦 Parsed event data keys:", Object.keys(eventData || {}));
        const eventType = eventData?.eventType ?? eventData?.metadata?.eventType ?? "unknown";
        const entityFqdn = eventData?.entityFqdn ?? "unknown";
        const slug = eventData?.slug ?? "unknown";
        console.log("📦 Event type:", eventType);
        console.log("📦 Entity FQDN:", entityFqdn);
        console.log("📦 Slug:", slug);

        // Check if this is a v2 Order event
        if (eventType === "com.wix.ecommerce.orders.api.v2.OrderEvent") {
          console.log("🆕 Detected v2 Order Created event");
          // Handle v2 event manually
          if (eventData?.entity) {
            console.log("⚠️ Manually handling v2 Order Created event...");
            // IMPORTANT: instanceId and siteId are in parsedPayload (JWS level), not in eventData
            const v2Event = {
              data: eventData.entity,
              metadata: {
                eventType: "order.created",
                entityId: eventData?.entity?.id ?? eventData?.entity?._id,
                instanceId: parsedPayload.instanceId ?? eventData?.instanceId,
                siteId: jwsSiteId,
                eventTime: eventData?.eventTime ?? new Date().toISOString(),
              }
            };
            console.log("📦 v2 event instanceId:", v2Event.metadata.instanceId, "siteId:", v2Event.metadata.siteId);
            await handleOrderEvent(v2Event);
            console.log("✅ v2 event handled successfully");
            return NextResponse.json({ ok: true });
          }
        }

        // Check if this is a v1 Order event (wix.ecom.v1.order)
        if (entityFqdn === "wix.ecom.v1.order") {
          console.log("🆕 Detected v1 Order event");

          let orderData = null;

          // For order.created events, data is in .entity
          if (slug === "created" && eventData.entity) {
            orderData = eventData.entity;
            console.log("📦 Extracted order from entity (created)");
          }
          // For order.updated events, data is in .updatedEvent.currentEntity
          else if (slug === "updated" && eventData.updatedEvent?.currentEntity) {
            orderData = eventData.updatedEvent.currentEntity;
            console.log("📦 Extracted order from updatedEvent.currentEntity");
          }
          // For payment_status_updated events, data is in .actionEvent.body.order or .order
          else if (slug === "payment_status_updated") {
            orderData = eventData.actionEvent?.body?.order ?? eventData.order ?? null;
            console.log("💳 Extracted order from payment_status_updated event");
            if (orderData) {
              console.log("💳 Order #" + orderData.number + " payment status changed");
            }
          }
          // For order.canceled events, data is likely in .entity or similar
          else if (slug === "canceled" && eventData.entity) {
            orderData = eventData.entity;
            console.log("📦 Extracted order from entity (canceled)");
            console.log("📦 Canceled order data:", JSON.stringify(orderData, null, 2).substring(0, 1000));
          }

          if (orderData) {
            console.log("✅ Found order data, ID:", orderData.id);
            const v1Event = {
              data: orderData,
              metadata: {
                eventType: `order.${slug}`,
                entityId: orderData.id ?? eventData.entityId,
                instanceId: parsedPayload.instanceId ?? eventData.instanceId,
                siteId: jwsSiteId,
                eventTime: eventData.eventTime ?? new Date().toISOString(),
              }
            };
            await handleOrderEvent(v1Event);
            console.log("✅ v1 event handled successfully");
            return NextResponse.json({ ok: true });
          } else {
            console.log("⚠️ Could not extract order data from v1 event");
            console.log("Event data structure:", JSON.stringify(eventData, null, 2).substring(0, 1000));
          }
        }
      }
    }
  } catch (e) {
    console.log("⚠️ Could not decode JWS token");
    console.error("Decode error:", e);
  }

  // Try processing with Wix SDK for v1 events
  try {
    console.log("Processing webhook with Wix SDK...");
    await wixClient.webhooks.process(rawBody);
    console.log("✅ Webhook processed successfully by SDK");
  } catch (error) {
    const errorMsg = (error as Error).message;
    console.error("❌ Wix webhook process failed");
    console.error("Error message:", errorMsg);

    // If SDK rejects v2 event type, return 200 OK anyway
    // (webhook was already handled manually above)
    if (errorMsg.includes("Unexpected event type: com.wix.ecommerce.orders.api.v2")) {
      console.log("✅ v2 event type ignored by SDK (already handled manually)");
      return NextResponse.json({ ok: true });
    }

    // For other errors, return error response
    console.error("Error stack:", (error as Error).stack);
    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
