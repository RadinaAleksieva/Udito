import { NextRequest, NextResponse } from "next/server";
import { AppStrategy, createClient } from "@wix/sdk";
import { orders } from "@wix/ecom";
import { sql } from "@/lib/sql";
import { getCompanyBySite, getLatestWixToken, initDb, saveWixTokens, trackOrderUsage, trackReceiptUsage } from "@/lib/db";
import { issueReceipt, issueRefundReceipt, getSaleReceiptByOrderId } from "@/lib/receipts";
import {
  upsertTenantOrder,
  logTenantWebhook,
  webhookAlreadyProcessed,
  incrementTenantOrderCount,
  incrementTenantReceiptCount,
  getTenantOrderById,
  tenantTablesExist,
  createTenantTables,
  TenantOrder,
  queuePendingRefund,
  hasPendingRefund,
} from "@/lib/tenant-db";
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

// Log webhook events to database for debugging
async function logWebhook(params: {
  eventType: string;
  orderId?: string | null;
  orderNumber?: string | null;
  siteId?: string | null;
  instanceId?: string | null;
  status: 'received' | 'processed' | 'error';
  errorMessage?: string | null;
  payloadPreview?: string | null;
}) {
  try {
    // Log to legacy shared table
    await sql`
      INSERT INTO webhook_logs (event_type, order_id, order_number, site_id, instance_id, status, error_message, payload_preview)
      VALUES (${params.eventType}, ${params.orderId ?? null}, ${params.orderNumber ?? null}, ${params.siteId ?? null}, ${params.instanceId ?? null}, ${params.status}, ${params.errorMessage ?? null}, ${params.payloadPreview ?? null})
    `;

    // Also log to tenant-specific table if siteId is known
    if (params.siteId) {
      try {
        await logTenantWebhook(params.siteId, {
          eventType: params.eventType,
          orderId: params.orderId ?? undefined,
          orderNumber: params.orderNumber ?? undefined,
          status: params.status,
          errorMessage: params.errorMessage ?? undefined,
          payloadPreview: params.payloadPreview ?? undefined,
        });
      } catch (tenantLogError) {
        // Tenant table might not exist yet - ignore
        console.warn("Failed to log to tenant webhook_logs:", tenantLogError);
      }
    }
  } catch (e) {
    console.warn("Failed to log webhook:", e);
  }
}

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

    // CRITICAL: Log order number and ID immediately to track updates
    const immediateOrderData = event?.data ?? {};
    const immediateOrder = immediateOrderData?.order ?? immediateOrderData;
    console.log("📦 Immediate order data:", {
      id: immediateOrder?.id ?? immediateOrder?._id ?? "NO_ID",
      number: immediateOrder?.number ?? "NO_NUMBER",
      paymentStatus: immediateOrder?.paymentStatus ?? "NO_STATUS",
      source: "handleOrderEvent entry",
    });

    // CRITICAL: Log payment data presence in incoming event
    const incomingPayments = event?.data?.orderTransactions?.payments ??
                              event?.data?.order?.orderTransactions?.payments ??
                              event?.data?.payments ?? [];
    console.log("📥 Incoming payment data:", {
      hasPayments: Array.isArray(incomingPayments) && incomingPayments.length > 0,
      paymentsCount: Array.isArray(incomingPayments) ? incomingPayments.length : 0,
      paymentStatus: event?.data?.paymentStatus ?? event?.data?.order?.paymentStatus ?? "unknown",
    });

    const raw = event?.data ?? {};
    const rawOrder = raw?.order ?? raw;
    const paymentStatus = raw?.paymentStatus ?? rawOrder?.paymentStatus ?? null;

  // Get event timestamp - this is when the payment status actually changed
  const eventTimestamp = event?.metadata?.eventTime ??
    event?.metadata?.dateTime ??
    event?.createdDate ??
    event?.timestamp ??
    null;

  // Check if this is an archived event - preserve the flag
  const eventType = event?.metadata?.eventType ?? "";
  const isArchivedEvent = eventType.includes("archived");

  const baseOrder = {
    ...rawOrder,
    paymentStatus,
    instanceId: event?.metadata?.instanceId ?? raw?.instanceId ?? rawOrder?.instanceId ?? null,
    // Force archived flag if this is an archived event
    archived: isArchivedEvent ? true : (rawOrder?.archived ?? raw?.archived ?? false),
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
      // Preserve archived flag from baseOrder (don't let enriched data overwrite it)
      const preservedArchived = baseOrder.archived;
      orderRaw = { ...baseOrder, ...enriched, archived: preservedArchived };
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
    // ALWAYS fetch for:
    // 1. payment_status_updated events (when order becomes paid)
    // 2. order.created events where order is already PAID (card payment completed at checkout)
    // 3. order.updated events where order is PAID but has no payment data
    // 4. ANY event where order is PAID but we don't have transactionRef yet
    const isPaymentStatusUpdate = event?.metadata?.eventType?.includes('payment_status');
    const isOrderCreated = event?.metadata?.eventType?.includes('created') || event?.metadata?.eventType === 'order.created';
    const isOrderUpdated = event?.metadata?.eventType?.includes('updated') || event?.metadata?.eventType === 'order.updated';
    const orderIsPaid = (base.paymentStatus || '').toUpperCase() === 'PAID';
    const hasEmptyPayments = !orderRaw?.orderTransactions?.payments?.length;
    const hasNoTransactionRef = !transactionRef && !orderRaw?.udito?.transactionRef;

    // For card payments, when order.created fires, the order is already PAID
    // We MUST fetch the payment data immediately
    // CRITICAL: Also fetch for order.updated if we're missing payment data!
    const needsOrderTransactions = !orderRaw?.orderTransactions ||
                                    isPaymentStatusUpdate ||
                                    (isOrderCreated && orderIsPaid && hasEmptyPayments) ||
                                    (isOrderUpdated && orderIsPaid && hasEmptyPayments) ||
                                    (orderIsPaid && hasNoTransactionRef);

    if (isOrderCreated && orderIsPaid) {
      console.log(`💳 Order ${base.number} created as PAID - this is a card payment, fetching payment data...`);
    }
    if (isOrderUpdated && orderIsPaid && (hasEmptyPayments || hasNoTransactionRef)) {
      console.log(`💳 Order ${base.number} updated as PAID but missing payment data - fetching now...`);
    }
    if (orderIsPaid && hasNoTransactionRef) {
      console.log(`⚠️ Order ${base.number} is PAID but has NO transactionRef - MUST fetch payment data!`);
    }

    if (needsOrderTransactions) {
      console.log(`🔍 Fetching orderTransactions for order ${orderId} (paymentStatusUpdate: ${isPaymentStatusUpdate})`);

      // Helper function to fetch with retry
      const fetchWithRetry = async (attempt: number = 1): Promise<any> => {
        const orderTx = await fetchOrderTransactionsForOrder({
          orderId,
          siteId: base.siteId ?? raw?.siteId ?? rawOrder?.siteId ?? null,
          instanceId:
            event?.metadata?.instanceId ??
            raw?.instanceId ??
            rawOrder?.instanceId ??
            null,
        });

        const hasPayments = orderTx?.orderTransactions?.payments?.length > 0 || orderTx?.payments?.length > 0;

        if (hasPayments) {
          return orderTx;
        }

        // If no payments and we haven't exhausted retries, wait and try again
        // Wix often needs several seconds to process payment data
        // Increased to 5 attempts with longer delays for reliability
        if (attempt < 5) {
          const delayMs = attempt * 3000; // 3s, 6s, 9s, 12s delays (total ~30s max)
          console.log(`⏳ No payment data on attempt ${attempt}/5, waiting ${delayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          return fetchWithRetry(attempt + 1);
        }
        console.log(`❌ Payment data fetch failed after ${attempt} attempts for order ${orderId}`);

        return orderTx; // Return whatever we have after all retries
      };

      const orderTx = await fetchWithRetry();

      if (orderTx?.orderTransactions || orderTx?.payments) {
        orderRaw = {
          ...orderRaw,
          orderTransactions: orderTx.orderTransactions ?? { payments: orderTx.payments },
        };
        const paymentCount = orderTx?.orderTransactions?.payments?.length || orderTx?.payments?.length || 0;
        console.log(`✅ OrderTransactions fetched for order ${orderId}, payments: ${paymentCount}`);
      } else {
        console.log(`⚠️ No orderTransactions found for order ${orderId} after retries`);
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

  // Fallback: look up siteId from companies table by instanceId
  if (!mapped.siteId && instanceId) {
    try {
      const companyLookup = await sql`
        SELECT site_id FROM companies WHERE instance_id = ${instanceId} LIMIT 1
      `;
      if (companyLookup.rows.length > 0 && companyLookup.rows[0].site_id) {
        mapped.siteId = companyLookup.rows[0].site_id;
        console.log("✅ Found siteId from companies table:", mapped.siteId);
      }
    } catch (error) {
      console.warn("Company lookup by instanceId failed", error);
    }
  }

  // ========== EARLY COMPANY LOOKUP ==========
  // Do company lookup BEFORE saving the order to ensure we have the correct siteId
  // This is critical for multi-tenant architecture
  let company = null;

  // Strategy 1: Look up by instanceId first (most reliable)
  if (instanceId) {
    const companyByInstance = await sql`
      SELECT site_id, instance_id, store_name, store_id, cod_receipts_enabled, receipts_start_date
      FROM companies
      WHERE instance_id = ${instanceId}
      LIMIT 1
    `;
    if (companyByInstance.rows.length > 0) {
      company = companyByInstance.rows[0];
      // ALWAYS use the siteId from the company record - it's the authoritative source
      if (company.site_id && company.site_id !== mapped.siteId) {
        console.log("📍 [EARLY] Override siteId from company:", { old: mapped.siteId, new: company.site_id });
        mapped.siteId = company.site_id;
      }
    }
  }

  // Strategy 2: If no instanceId, try siteId
  if (!company && mapped.siteId) {
    const companyBySite = await sql`
      SELECT site_id, instance_id, store_name, store_id, cod_receipts_enabled, receipts_start_date
      FROM companies
      WHERE site_id = ${mapped.siteId}
      LIMIT 1
    `;
    if (companyBySite.rows.length > 0) {
      company = companyBySite.rows[0];
    }
  }

  // Strategy 3: Fallback - find company by looking for single active company
  // Only use this if there's exactly ONE company with receipts enabled
  if (!company && !mapped.siteId && !instanceId) {
    console.warn("⚠️ [EARLY] No instanceId or siteId in webhook, trying fallback lookup...");
    const activeCompanies = await sql`
      SELECT site_id, instance_id, store_name, store_id, cod_receipts_enabled, receipts_start_date
      FROM companies
      WHERE receipts_start_date IS NOT NULL
      LIMIT 2
    `;
    if (activeCompanies.rows.length === 1) {
      company = activeCompanies.rows[0];
      console.log("📍 [EARLY] Using single active company as fallback:", company.store_name);
      if (company.site_id) {
        mapped.siteId = company.site_id;
      }
    } else if (activeCompanies.rows.length > 1) {
      console.error("❌ [EARLY] Cannot determine company: found", activeCompanies.rows.length, "active companies - order will have null siteId!");
    }
  }

  console.log("🏢 [EARLY] Company lookup result:", {
    siteId: mapped.siteId,
    instanceId,
    found: !!company,
    storeName: company?.store_name,
    storeId: company?.store_id
  });

  // Log if we still don't have siteId - this is a critical issue
  if (!mapped.siteId) {
    console.error("❌ CRITICAL: No siteId found for order", mapped.number, "- order will not appear in UI!");
    console.error("Debug info:", {
      eventMetadataSiteId: event?.metadata?.siteId,
      rawSiteId: raw?.siteId,
      rawOrderSiteId: rawOrder?.siteId,
      instanceId,
      companyFound: !!company,
    });
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

  // === SAVE TO TENANT TABLE ONLY ===
  // This is a NEW order from webhook (not synced), so is_synced = false = chargeable
  if (!mapped.siteId) {
    console.error("❌ No siteId in order - cannot save to tenant table");
    return; // Cannot save without siteId
  }

  // Ensure tenant tables exist (will auto-create if not)
  const tenantOrder: TenantOrder = {
    id: mapped.id,
    number: mapped.number,
    status: mapped.status,
    paymentStatus: mapped.paymentStatus,
    createdAt: mapped.createdAt,
    updatedAt: mapped.updatedAt,
    paidAt: effectivePaidAt,
    currency: mapped.currency,
    subtotal: mapped.subtotal,
    taxTotal: mapped.taxTotal,
    shippingTotal: mapped.shippingTotal,
    discountTotal: mapped.discountTotal,
    total: mapped.total,
    customerEmail: mapped.customerEmail,
    customerName: mapped.customerName,
    source: "webhook",
    isSynced: false, // ✅ NEW order from webhook - CHARGEABLE
    raw: orderRaw,
  };

  await upsertTenantOrder(mapped.siteId, tenantOrder);
  console.log("✅ Order saved to tenant table:", mapped.number);

  // Increment order count for billing (only for NEW orders)
  await incrementTenantOrderCount(mapped.siteId);

  console.log("✅ Order saved successfully:", mapped.number);

  // Track order usage for plan limits (legacy)
  await trackOrderUsage(mapped.siteId, instanceId);

  // Read the order back from TENANT database for receipt logic
  // This ensures we use the enriched data we've already processed
  const savedOrder = await getTenantOrderById(mapped.siteId, mapped.id);
  const savedRaw = savedOrder?.raw ?? orderRaw;
  const statusText = (savedOrder?.status || mapped.status || "").toLowerCase();

  // Company was already looked up in EARLY COMPANY LOOKUP section above
  // No need to look up again - company variable is already set with correct siteId

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

  // Extract transaction ref - try multiple sources
  // 1. From saved database order (has enriched data from previous webhooks/syncs)
  // 2. From current webhook's orderRaw (freshly enriched with payment data)
  // 3. For COD - generate from order ID
  let receiptTxRef = extractTransactionRef(savedRaw);

  // Fallback: try from current webhook's orderRaw (in case it has newer data)
  if (!receiptTxRef) {
    receiptTxRef = extractTransactionRef(orderRaw);
    if (receiptTxRef) {
      console.log(`💳 Got transactionRef from webhook orderRaw: ${receiptTxRef}`);
    }
  }

  // For COD orders, generate transaction ref from order ID if not available
  if (!receiptTxRef && isCOD && mapped.id) {
    receiptTxRef = `COD-${mapped.id}`;
    console.log(`💰 Generated COD transaction ref: ${receiptTxRef}`);
  }

  // Log if we still don't have transactionRef for a PAID order
  const orderIsPaidCheck = (savedOrder?.payment_status || mapped.paymentStatus || "").toUpperCase() === "PAID";
  if (!receiptTxRef && orderIsPaidCheck && !isCOD) {
    console.log(`⚠️ CRITICAL: Order ${mapped.number} is PAID but we have NO transactionRef!`);
    console.log(`⚠️ savedRaw.udito:`, JSON.stringify(savedRaw?.udito ?? {}, null, 2));
    console.log(`⚠️ orderRaw.udito:`, JSON.stringify(orderRaw?.udito ?? {}, null, 2));
  }

  // STRICT CHECK: Only issue receipts for orders paid on or after the receipts start date
  // If no receipts_start_date is configured, use far-future date to prevent any receipts
  // Note: database returns snake_case (receipts_start_date)
  const companyStartDate = company?.receipts_start_date ?? company?.receiptsStartDate ?? null;
  const receiptsStartDate = companyStartDate
    ? new Date(companyStartDate)
    : new Date("2099-01-01T00:00:00Z"); // Far future = no receipts if not configured
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
        siteId: mapped.siteId, // For tenant-specific tables
        transactionRef: receiptTxRef, // Store transaction ref for refunds to use
      });
      // Track receipt usage for plan limits (legacy)
      await trackReceiptUsage(mapped.siteId, instanceId);
      // Track receipt in tenant table (for billing)
      if (mapped.siteId) {
        await incrementTenantReceiptCount(mapped.siteId);
      }
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

  // Handle refunds - queue for later processing
  // This ensures reliability: if receipt issuance fails, we can retry via cron
  if ((isRefunded || hasRefundActivity) && company?.store_id && mapped.siteId) {
    // For partial refunds, use the refund amount from activity; for full refunds use order total
    const partialRefundAmount = refundActivity?.amount?.value ??
                                refundActivity?.refundAmount ??
                                orderRaw?.refundedAmount?.value ??
                                orderRaw?.refundedAmount;
    const refundAmount = Number(partialRefundAmount) || Number(mapped.total) || 0;
    const isPartialRefund = paymentStatusUpper === "PARTIALLY_REFUNDED";
    const refundReason = statusText.includes("cancel") ? "cancelled" : (isPartialRefund ? "partial_refund" : "refunded");

    // Check if we already have a pending refund queued for this order
    const alreadyQueued = await hasPendingRefund(mapped.siteId, mapped.id);

    if (!alreadyQueued && refundAmount > 0) {
      try {
        const queueId = await queuePendingRefund(mapped.siteId, {
          orderId: mapped.id,
          refundAmount,
          reason: refundReason,
          eventPayload: {
            order: mapped,
            refundTimestamp: refundTimestamp ?? new Date().toISOString(),
            storeId: company.store_id,
          },
        });
        console.log(`📋 Refund queued for order ${mapped.number}, queue ID: ${queueId}`);
      } catch (queueError) {
        console.error("Failed to queue refund for order", mapped.number, queueError);
        // Fallback: try to issue directly
        const originalReceipt = await getSaleReceiptByOrderId(mapped.siteId!, mapped.id);
        if (originalReceipt) {
          const result = await issueRefundReceipt({
            orderId: mapped.id,
            payload: {
              ...mapped,
              originalReceiptId: originalReceipt.id,
              refundReason,
            },
            businessId: null,
            issuedAt: refundTimestamp ?? new Date().toISOString(),
            refundAmount,
            siteId: mapped.siteId,
          });
          if (result.created) {
            console.log("Refund receipt created (fallback) for order", mapped.number);
          }
        }
      }
    } else if (alreadyQueued) {
      console.log(`📋 Refund already queued for order ${mapped.number}, skipping`);
    }
  } else if ((isRefunded || hasRefundActivity) && !mapped.siteId) {
    console.warn("❌ Cannot queue refund - no siteId for order:", mapped.number);
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

  // Extract instanceId and siteId from URL query parameters (passed during webhook registration)
  const url = new URL(request.url);
  const urlInstanceId = url.searchParams.get("instanceId");
  const urlSiteId = url.searchParams.get("siteId");
  console.log("📍 URL params - instanceId:", urlInstanceId, "siteId:", urlSiteId);

  // Log all incoming webhooks
  console.log("=== WEBHOOK RECEIVED ===");
  console.log("Timestamp:", new Date().toISOString());
  console.log("Body length:", rawBody.length);
  console.log("Body preview:", rawBody.substring(0, 200));

  // LOG ALL HEADERS to find instance/siteId
  console.log("=== WEBHOOK HEADERS ===");
  const headers: Record<string, string> = {};
  let headerInstanceId: string | null = null;
  let headerSiteId: string | null = null;
  request.headers.forEach((value, key) => {
    headers[key] = value;
    const keyLower = key.toLowerCase();
    // Log headers that might contain instance info
    if (keyLower.includes('wix') || keyLower.includes('instance') || keyLower.includes('site')) {
      console.log(`📌 IMPORTANT HEADER: ${key} = ${value.substring(0, 100)}...`);
    }
    // Extract instance from x-wix-instance header (Wix often sends this)
    if (keyLower === 'x-wix-instance' || keyLower === 'wix-instance') {
      const decoded = decodeWixInstance(value);
      headerInstanceId = decoded.instanceId;
      headerSiteId = decoded.siteId;
      console.log(`📌 DECODED FROM HEADER: instanceId=${headerInstanceId}, siteId=${headerSiteId}`);
    }
  });
  console.log("All headers:", JSON.stringify(headers, null, 2));

  if (!wixClient) {
    console.error("Missing Wix app credentials");
    return NextResponse.json(
      { ok: false, error: "Missing Wix app credentials." },
      { status: 500 }
    );
  }

  await initDb();

  // Log received webhook immediately
  await logWebhook({
    eventType: 'unknown',
    status: 'received',
    payloadPreview: rawBody.substring(0, 500),
  });

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
      console.log("📦 parsedPayload.instance:", parsedPayload?.instance ? parsedPayload.instance.substring(0, 50) + "..." : "NULL");

      // Extract siteId from the instance JWT token (critical for store identification!)
      const instanceToken = parsedPayload?.instance;
      const decodedInstance = instanceToken ? decodeWixInstance(instanceToken) : null;
      console.log("📦 decodedInstance:", JSON.stringify(decodedInstance));

      // Try multiple sources for siteId - priority order:
      // 1. URL params (set during webhook registration)
      // 2. HTTP headers (x-wix-instance)
      // 3. JWS payload (instance JWT)
      // 4. JWS payload direct fields
      const jwsSiteId = urlSiteId ?? headerSiteId ?? decodedInstance?.siteId ?? parsedPayload?.siteId ?? parsedPayload?.site_id ?? null;
      const jwsInstanceId = urlInstanceId ?? headerInstanceId ?? decodedInstance?.instanceId ?? parsedPayload?.instanceId ?? parsedPayload?.instance_id ?? null;
      console.log("📦 Extracted siteId:", jwsSiteId, "instanceId:", jwsInstanceId);
      console.log("📦 Sources - URL:", urlSiteId, urlInstanceId, "| Header:", headerSiteId, headerInstanceId, "| JWS:", decodedInstance?.siteId, decodedInstance?.instanceId);

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
                instanceId: jwsInstanceId ?? eventData?.instanceId,
                siteId: jwsSiteId,
                eventTime: eventData?.eventTime ?? new Date().toISOString(),
              }
            };
            console.log("📦 v2 event instanceId:", v2Event.metadata.instanceId, "siteId:", v2Event.metadata.siteId);
            await handleOrderEvent(v2Event);
            console.log("✅ v2 event handled successfully");
            await logWebhook({
              eventType: 'v2.order.created',
              orderId: eventData?.entity?.id,
              orderNumber: eventData?.entity?.number,
              siteId: jwsSiteId,
              instanceId: parsedPayload.instanceId,
              status: 'processed',
            });
            return NextResponse.json({ ok: true });
          }
        }

        // Check if this is a v1 Order event (wix.ecom.v1.order)
        if (entityFqdn === "wix.ecom.v1.order") {
          console.log("🆕 Detected v1 Order event - slug:", slug);
          console.log("📋 Full eventData structure:", JSON.stringify({
            slug,
            hasUpdatedEvent: !!eventData.updatedEvent,
            hasCurrentEntity: !!eventData.updatedEvent?.currentEntity,
            currentEntityNumber: eventData.updatedEvent?.currentEntity?.number,
            hasEntity: !!eventData.entity,
            hasData: !!eventData.data,
            hasCreatedEvent: !!eventData.createdEvent,
            hasOrder: !!eventData.order,
            entityKeys: eventData.entity ? Object.keys(eventData.entity) : [],
            topLevelKeys: Object.keys(eventData || {}),
          }));

          let orderData = null;

          // For order.created events, try multiple possible locations
          if (slug === "created") {
            console.log("📦 Processing order.created event...");
            console.log("📦 eventData.entity type:", typeof eventData.entity);
            console.log("📦 eventData.entity value:", eventData.entity ? "EXISTS" : "NULL/UNDEFINED");
            console.log("📦 eventData.entityId:", eventData.entityId);

            // Primary: data is in .entity
            if (eventData.entity && Object.keys(eventData.entity).length > 0) {
              orderData = eventData.entity;
              console.log("📦 Extracted order from entity (created)");
            }
            // Fallback 1: data might be in .createdEvent.entity
            else if (eventData.createdEvent?.entity) {
              orderData = eventData.createdEvent.entity;
              console.log("📦 Extracted order from createdEvent.entity");
            }
            // Fallback 2: data might be directly in eventData if it looks like an order
            else if (eventData.id && (eventData.lineItems || eventData.buyerInfo || eventData.priceSummary)) {
              orderData = eventData;
              console.log("📦 Extracted order from eventData directly (order is at root level)");
            }
            // Fallback 3: data might be in .data
            else if (eventData.data && (eventData.data.id || eventData.data.lineItems)) {
              orderData = eventData.data;
              console.log("📦 Extracted order from data (created)");
            }
            // Fallback 4: data might be in .order
            else if (eventData.order) {
              orderData = eventData.order;
              console.log("📦 Extracted order from order (created)");
            }
            // Last resort: check if entity exists but is an empty object vs truly null
            else if (eventData.entity === null || eventData.entity === undefined) {
              console.log("📦 entity is explicitly null/undefined, checking other paths...");
              // Log all available data for debugging
              console.log("📦 Available eventData keys with values:", Object.entries(eventData || {})
                .filter(([_, v]) => v !== null && v !== undefined)
                .map(([k, v]) => `${k}: ${typeof v}`)
                .join(", "));
            }
          }
          // For order.updated events, data can be in many different locations
          else if (slug === "updated") {
            console.log("📦 Processing UPDATED event...");
            console.log("📦 Full eventData structure for updated event:", JSON.stringify({
              hasUpdatedEvent: !!eventData.updatedEvent,
              hasCurrentEntity: !!eventData.updatedEvent?.currentEntity,
              hasPreviousEntity: !!eventData.updatedEvent?.previousEntity,
              hasEntity: !!eventData.entity,
              hasOrder: !!eventData.order,
              hasData: !!eventData.data,
              hasActionEvent: !!eventData.actionEvent,
              entityId: eventData.entityId,
              topLevelKeys: Object.keys(eventData || {}),
              updatedEventKeys: eventData.updatedEvent ? Object.keys(eventData.updatedEvent) : [],
            }));

            // Try all possible paths for updated event data
            // Path 1: updatedEvent.currentEntity (most common for v1)
            if (eventData.updatedEvent?.currentEntity) {
              orderData = eventData.updatedEvent.currentEntity;
              console.log("📦 Extracted order from updatedEvent.currentEntity, number:", orderData.number);
            }
            // Path 2: updatedEvent.entity
            else if (eventData.updatedEvent?.entity) {
              orderData = eventData.updatedEvent.entity;
              console.log("📦 Extracted order from updatedEvent.entity, number:", orderData.number);
            }
            // Path 3: entity at root
            else if (eventData.entity && (eventData.entity.id || eventData.entity._id)) {
              orderData = eventData.entity;
              console.log("📦 Extracted order from entity (updated), number:", orderData.number);
            }
            // Path 4: order at root
            else if (eventData.order && (eventData.order.id || eventData.order._id)) {
              orderData = eventData.order;
              console.log("📦 Extracted order from order (updated), number:", orderData.number);
            }
            // Path 5: data at root
            else if (eventData.data && (eventData.data.id || eventData.data._id)) {
              orderData = eventData.data;
              console.log("📦 Extracted order from data (updated), number:", orderData.number);
            }
            // Path 6: actionEvent.body.order
            else if (eventData.actionEvent?.body?.order) {
              orderData = eventData.actionEvent.body.order;
              console.log("📦 Extracted order from actionEvent.body.order (updated), number:", orderData.number);
            }
            // Path 7: Check if eventData itself looks like an order
            else if (eventData.id && (eventData.lineItems || eventData.buyerInfo || eventData.priceSummary || eventData.number)) {
              orderData = eventData;
              console.log("📦 Extracted order from eventData root (updated), number:", orderData.number);
            }

            if (orderData) {
              console.log("📦 Updated event order fields:", JSON.stringify({
                id: orderData.id,
                _id: orderData._id,
                number: orderData.number,
                orderNumber: orderData.orderNumber,
                paymentStatus: orderData.paymentStatus,
                status: orderData.status,
                hasLineItems: !!orderData.lineItems,
                keys: Object.keys(orderData || {}).slice(0, 15),
              }));
            } else {
              console.log("⚠️ Could not find order data in updated event. Full eventData:", JSON.stringify(eventData, null, 2).substring(0, 3000));
            }
          }
          // For payment_status_updated events, data is in .actionEvent.body.order or .order
          // Payment data might also be in actionEvent.body.payments or entity.orderTransactions
          else if (slug === "payment_status_updated") {
            orderData = eventData.actionEvent?.body?.order ?? eventData.order ?? eventData.entity ?? null;
            console.log("💳 Processing payment_status_updated event");

            // Try to extract payment data from the event itself
            const eventPayments = eventData.actionEvent?.body?.payments ??
                                   eventData.payments ??
                                   eventData.entity?.orderTransactions?.payments ??
                                   eventData.orderTransactions?.payments ??
                                   null;

            // Also check for transaction data
            const eventTransactions = eventData.actionEvent?.body?.orderTransactions ??
                                       eventData.orderTransactions ??
                                       eventData.entity?.orderTransactions ??
                                       null;

            console.log("💳 Event payment data check:", {
              hasEventPayments: !!eventPayments,
              paymentsCount: Array.isArray(eventPayments) ? eventPayments.length : 0,
              hasEventTransactions: !!eventTransactions,
              orderDataKeys: orderData ? Object.keys(orderData).slice(0, 10) : [],
            });

            if (orderData) {
              // Enrich order data with payment info from event
              if (eventPayments && Array.isArray(eventPayments) && eventPayments.length > 0) {
                orderData = {
                  ...orderData,
                  orderTransactions: {
                    ...(orderData.orderTransactions || {}),
                    payments: eventPayments,
                  },
                };
                console.log("💳 Enriched order with payments from event");
              }

              if (eventTransactions) {
                orderData = {
                  ...orderData,
                  orderTransactions: eventTransactions,
                };
                console.log("💳 Enriched order with orderTransactions from event");
              }

              console.log("💳 Order #" + orderData.number + " payment status changed to " + (orderData.paymentStatus || "unknown"));
            }
          }
          // For order.canceled events, data is likely in .entity or similar
          else if (slug === "canceled" && eventData.entity) {
            orderData = eventData.entity;
            console.log("📦 Extracted order from entity (canceled)");
            console.log("📦 Canceled order data:", JSON.stringify(orderData, null, 2).substring(0, 1000));
          }
          // For order.archived events
          else if (slug === "archived") {
            orderData = eventData.archivedEvent?.entity ??
              eventData.archivedEvent?.order ??
              eventData.entity ??
              eventData.order ??
              null;
            if (orderData) {
              // Ensure archived flag is set
              orderData = { ...orderData, archived: true };
              console.log("📦 Extracted order from archived event");
            }
          }
          // For order.rejected events
          else if (slug === "rejected") {
            orderData = eventData.entity ?? eventData.order ?? null;
            if (orderData) {
              console.log("📦 Extracted order from rejected event");
            }
          }
          // Generic fallback for any other order event types
          else if (!orderData) {
            orderData = eventData.entity ??
              eventData.order ??
              eventData.updatedEvent?.currentEntity ??
              eventData.actionEvent?.body?.order ??
              null;
            if (orderData) {
              console.log(`📦 Extracted order from generic fallback for slug: ${slug}`);
            }
          }

          if (orderData) {
            console.log("✅ Found order data for slug:", slug);
            console.log("✅ Order ID:", orderData.id ?? orderData._id);
            console.log("✅ Order number:", orderData.number);
            console.log("✅ Order paymentStatus:", orderData.paymentStatus);
            const v1Event = {
              data: orderData,
              metadata: {
                eventType: `order.${slug}`,
                entityId: orderData.id ?? eventData.entityId,
                instanceId: jwsInstanceId ?? eventData.instanceId,
                siteId: jwsSiteId,
                eventTime: eventData.eventTime ?? new Date().toISOString(),
              }
            };
            console.log("🚀 Calling handleOrderEvent for", `order.${slug}`, "with order number:", orderData.number);
            await handleOrderEvent(v1Event);
            console.log("✅ v1 event handled successfully");
            // Extract order number from various possible locations
            const orderNumber = orderData.number ??
              orderData.orderNumber?.number ??
              orderData.orderNumber?.displayNumber ??
              orderData.orderNumber ??
              orderData.displayId ??
              null;
            await logWebhook({
              eventType: `v1.order.${slug}`,
              orderId: orderData.id ?? orderData._id,
              orderNumber: orderNumber,
              siteId: jwsSiteId,
              instanceId: parsedPayload.instanceId,
              status: 'processed',
            });
            return NextResponse.json({ ok: true });
          } else {
            console.log("⚠️ Could not extract order data from v1 event");
            console.log("Event data structure:", JSON.stringify(eventData, null, 2).substring(0, 2000));
            console.log("Slug:", slug);
            console.log("EntityFqdn:", entityFqdn);
            // Log more detail about what's in eventData
            console.log("eventData.entity:", eventData.entity ? "EXISTS" : "NULL");
            console.log("eventData.data:", eventData.data ? "EXISTS" : "NULL");
            console.log("eventData.createdEvent:", eventData.createdEvent ? "EXISTS" : "NULL");
            await logWebhook({
              eventType: `v1.order.${slug}`,
              status: 'error',
              errorMessage: `Could not extract order data from v1 event. Slug: ${slug}, hasEntity: ${!!eventData.entity}, hasData: ${!!eventData.data}`,
              payloadPreview: JSON.stringify(eventData, null, 2).substring(0, 1000),
            });
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
