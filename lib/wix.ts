import { getLatestWixToken, getLatestWixTokenForSite, saveWixTokens } from "@/lib/db";

type WixOrderQueryResponse = {
  orders?: unknown[];
  results?: unknown[];
  items?: unknown[];
  order?: unknown;
  metadata?: {
    paging?: {
      cursor?: string | null;
      nextCursor?: string | null;
    };
    pagingMetadata?: {
      cursor?: string | null;
      nextCursor?: string | null;
    };
  };
  paging?: {
    cursor?: string | null;
    nextCursor?: string | null;
  };
  pagingMetadata?: {
    cursor?: string | null;
    nextCursor?: string | null;
  };
  cursor?: string | null;
  nextCursor?: string | null;
};

const WIX_API_BASE = process.env.WIX_API_BASE || "https://www.wixapis.com";

export async function getTokenInfo(token: string) {
  const response = await fetch(`${WIX_API_BASE}/oauth2/token-info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wix token info failed: ${response.status} ${text}`);
  }

  return (await response.json()) as {
    instanceId?: string;
    appId?: string;
    uid?: string;
  };
}

async function fetchAccessToken(params?: {
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}): Promise<string> {
  if (process.env.WIX_ACCESS_TOKEN) {
    return process.env.WIX_ACCESS_TOKEN;
  }

  const dbToken = params?.siteId || params?.instanceId || params?.businessId
    ? await getLatestWixTokenForSite({
        siteId: params?.siteId ?? null,
        instanceId: params?.instanceId ?? null,
        businessId: params?.businessId ?? null,
      })
    : await getLatestWixToken();
  if (dbToken?.access_token && dbToken.expires_at) {
    const expiresAt = new Date(dbToken.expires_at).getTime();
    if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) {
      return dbToken.access_token;
    }
  }

  const clientId = process.env.WIX_APP_ID;
  const clientSecret = process.env.WIX_APP_SECRET;
  let instanceId =
    process.env.WIX_INSTANCE_ID || params?.instanceId || dbToken?.instance_id;
  const rawInstanceId = instanceId;
  if (instanceId && !/^[0-9a-fA-F-]{36}$/.test(instanceId)) {
    try {
      const tokenInfo = await getTokenInfo(instanceId);
      instanceId = tokenInfo?.instanceId ?? instanceId;
    } catch (error) {
      console.warn("Wix token info failed", error);
      instanceId = rawInstanceId ?? instanceId;
    }
  }

  if (clientId && clientSecret && instanceId) {
    const response = await fetch(`${WIX_API_BASE}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        instance_id: instanceId,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Wix token create failed: ${response.status} ${text}`);
    }

    const data = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) {
      throw new Error("Wix token create returned no access_token.");
    }

    const expiresAt =
      typeof data.expires_in === "number"
        ? new Date(Date.now() + data.expires_in * 1000).toISOString()
        : null;

    await saveWixTokens({
      businessId: params?.businessId ?? null,
      instanceId,
      siteId: dbToken?.site_id ?? null,
      accessToken: data.access_token,
      refreshToken: null,
      expiresAt,
    });

    return data.access_token;
  }

  const refreshToken = process.env.WIX_REFRESH_TOKEN || dbToken?.refresh_token;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Wix access token or refresh credentials.");
  }

  console.log("Refreshing Wix token for site:", dbToken?.site_id);

  const response = await fetch("https://www.wix.com/oauth/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wix token refresh failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Wix token refresh returned no access_token.");
  }

  // Save the refreshed token to database
  const expiresAt = typeof data.expires_in === "number"
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  await saveWixTokens({
    businessId: params?.businessId ?? null,
    instanceId: dbToken?.instance_id ?? null,
    siteId: dbToken?.site_id ?? null,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // Keep old refresh token if not provided
    expiresAt,
  });

  console.log("✅ Wix token refreshed and saved for site:", dbToken?.site_id);

  return data.access_token;
}

export async function getAccessToken(params?: {
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}) {
  return fetchAccessToken(params);
}

export async function queryPaidOrders(options: {
  startDateIso: string;
  cursor?: string | null;
  limit?: number;
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}) {
  return queryOrders({
    startDateIso: options.startDateIso,
    cursor: options.cursor,
    limit: options.limit,
    siteId: options.siteId,
    instanceId: options.instanceId,
    businessId: options.businessId,
    paymentStatus: "PAID",
  });
}

export async function queryOrders(options: {
  startDateIso: string;
  cursor?: string | null;
  offset?: number | null;
  limit?: number;
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
  paymentStatus?: string | null;
}) {
  const accessToken = await fetchAccessToken({
    siteId: options.siteId ?? null,
    instanceId: options.instanceId ?? null,
    businessId: options.businessId ?? null,
  });
  const tokenMeta =
    options.siteId || options.instanceId || options.businessId
      ? await getLatestWixTokenForSite({
          siteId: options.siteId ?? null,
          instanceId: options.instanceId ?? null,
          businessId: options.businessId ?? null,
        })
      : await getLatestWixToken();
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;
  const siteId =
    process.env.WIX_SITE_ID ||
    options.siteId ||
    tokenMeta?.site_id ||
    "";
  const limit = options.limit ?? 100;

  const filter: Record<string, unknown> = {
    createdDate: { $gte: options.startDateIso },
  };
  if (options.paymentStatus) {
    filter.paymentStatus = { $eq: options.paymentStatus };
  }

  const response = await fetch(`${WIX_API_BASE}/ecom/v1/orders/query`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(siteId ? { "wix-site-id": siteId } : {}),
    },
    body: JSON.stringify({
      query: {
        filter,
        sort: [{ fieldName: "createdDate", order: "ASC" }], // ASC required for cursor pagination to work
        paging: {
          limit,
          // Use offset pagination - cursor pagination doesn't work reliably with Wix API
          ...(options.offset != null ? { offset: options.offset } : {}),
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wix orders query failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as WixOrderQueryResponse;
  const orders =
    data.orders ??
    data.results ??
    data.items ??
    (data.order ? [data.order] : []);

  // Extract pagination metadata
  const metadata = (data as any).metadata ?? {};
  const total = metadata.total ?? null;
  const currentOffset = metadata.offset ?? options.offset ?? 0;
  const count = metadata.count ?? orders.length;

  // Calculate next offset for pagination
  const nextOffset = currentOffset + count;
  const hasMore = total != null ? nextOffset < total : count === options.limit;

  // Keep cursor extraction for backward compatibility (though it doesn't work reliably)
  const cursor =
    (data.metadata as any)?.cursors?.next ??
    data.metadata?.paging?.cursor ??
    data.metadata?.paging?.nextCursor ??
    data.metadata?.pagingMetadata?.cursor ??
    data.metadata?.pagingMetadata?.nextCursor ??
    data.paging?.nextCursor ??
    data.paging?.cursor ??
    data.pagingMetadata?.nextCursor ??
    data.pagingMetadata?.cursor ??
    data.nextCursor ??
    data.cursor ??
    null;

  return { orders, cursor, total, offset: currentOffset, nextOffset, hasMore };
}

export async function getAppInstanceDetails(params: {
  instanceId?: string | null;
  accessToken?: string | null;
}) {
  const instanceId = params.instanceId ?? null;
  const accessToken =
    params.accessToken ?? (instanceId ? await fetchAccessToken({ instanceId }) : null);
  if (!accessToken) return null;
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;

  const response = await fetch(`${WIX_API_BASE}/apps/v1/instance`, {
    method: "GET",
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Wix get app instance failed: ${response.status} ${text}`
    );
  }

  const data = (await response.json()) as {
    instance?: {
      instanceId?: string;
      site?: {
        siteId?: string;
      };
      siteId?: string;
    };
    site?: {
      siteId?: string;
    };
  };

  return {
    instanceId: data.instance?.instanceId ?? instanceId ?? null,
    siteId:
      data.instance?.site?.siteId ??
      data.instance?.siteId ??
      data.site?.siteId ??
      null,
  };
}

const STRIPE_PREFIXES = ["pi_", "ch_", "pay_"];

function findStripeId(value: any): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    return STRIPE_PREFIXES.some((prefix) => value.startsWith(prefix))
      ? value
      : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStripeId(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      const found = findStripeId(value[key]);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Helper to pick the best payment from a payments array.
 * Prioritizes APPROVED/COMPLETED/REFUNDED over PENDING_MERCHANT.
 */
function pickBestPaymentFromArray(payments: any[]): any | null {
  if (!Array.isArray(payments) || payments.length === 0) return null;
  const validStatuses = ["APPROVED", "COMPLETED", "REFUNDED"];
  const validPayment = payments.find(
    (p: any) => validStatuses.includes(p?.regularPaymentDetails?.status)
  );
  return validPayment ?? payments[0] ?? null;
}

export function extractTransactionRef(raw: any): string | null {
  const explicit = raw?.udito?.transactionRef ?? null;
  const stripeFromRaw = findStripeId(raw);
  const stripeFromExplicit = findStripeId(explicit);

  // Pick best payment from orderTransactions.payments array
  const orderTxPayments = raw?.orderTransactions?.payments;
  const bestOrderTxPayment = Array.isArray(orderTxPayments)
    ? pickBestPaymentFromArray(orderTxPayments)
    : null;

  // Pick best payment from payments array
  const paymentsArray = raw?.payments;
  const bestPayment = Array.isArray(paymentsArray)
    ? pickBestPaymentFromArray(paymentsArray)
    : null;

  // Pick best from transactions array
  const txArray = raw?.transactions;
  const bestTx = Array.isArray(txArray)
    ? pickBestPaymentFromArray(txArray)
    : null;

  // IMPORTANT: Prioritize Stripe IDs (pi_*, ch_*, pay_*) over Wix Payment IDs
  // Stripe IDs are the actual payment provider transaction references
  // Wix Payment IDs are internal identifiers that should only be used as fallback
  return (
    stripeFromExplicit ??
    stripeFromRaw ??
    explicit ??
    raw?.providerTransactionId ??
    raw?.providerPaymentId ??
    raw?.stripePaymentId ??
    raw?.gatewayReferenceId ??
    raw?.paymentId ??
    raw?.payment_id ??
    raw?.paymentInfo?.id ??
    raw?.paymentInfo?.paymentId ??
    raw?.paymentInfo?.transactionId ??
    raw?.paymentInfo?.providerTransactionId ??
    raw?.paymentMethod?.transactionId ??
    raw?.paymentMethod?.paymentId ??
    raw?.paymentMethodSummary?.transactionId ??
    raw?.paymentMethodSummary?.paymentId ??
    raw?.payment?.transactionId ??
    raw?.payment?.id ??
    raw?.payment?.chargeId ??
    raw?.payment?.paymentId ??
    bestOrderTxPayment?.regularPaymentDetails?.providerTransactionId ??
    bestOrderTxPayment?.regularPaymentDetails?.gatewayTransactionId ??
    bestOrderTxPayment?.regularPaymentDetails?.paymentOrderId ??
    bestOrderTxPayment?.id ??
    raw?.payment?.providerTransactionId ??
    raw?.payment?.gatewayTransactionId ??
    raw?.payment?.acquirerReferenceNumber ??
    raw?.payment?.referenceId ??
    raw?.payment?.providerReferenceId ??
    bestPayment?.paymentId ??
    bestPayment?.transactionId ??
    bestPayment?.id ??
    bestPayment?.chargeId ??
    bestPayment?.providerTransactionId ??
    bestPayment?.gatewayTransactionId ??
    bestTx?.transactionId ??
    bestTx?.id ??
    bestTx?.paymentId ??
    bestTx?.providerTransactionId ??
    bestTx?.providerPaymentId ??
    null
  );
}

export function extractPaymentId(raw: any): string | null {
  return (
    raw?.paymentId ??
    raw?.payment_id ??
    raw?.paymentInfo?.id ??
    raw?.paymentInfo?.paymentId ??
    raw?.payment?.id ??
    raw?.payment?.paymentId ??
    raw?.paymentMethod?.paymentId ??
    raw?.paymentMethodSummary?.paymentId ??
    raw?.orderTransactions?.payments?.[0]?.id ??
    raw?.orderTransactions?.payments?.[0]?.paymentId ??
    raw?.payments?.[0]?.id ??
    raw?.payments?.[0]?.paymentId ??
    raw?.transactions?.[0]?.paymentId ??
    null
  );
}

export function needsOrderEnrichment(raw: any) {
  const hasTransaction = Boolean(extractTransactionRef(raw));
  const hasDeliveryMethod = Boolean(extractDeliveryMethodFromOrder(raw));
  const hasShipping =
    Boolean(
      raw?.shippingInfo ??
        raw?.deliveryOption ??
        raw?.deliveryAddress ??
        raw?.shippingAddress ??
        raw?.fulfillments?.[0]?.deliveryMethod
    ) || false;
  const hasCustomer =
    Boolean(
      raw?.buyerInfo ??
        raw?.buyer ??
        raw?.customer ??
        raw?.customerInfo ??
        raw?.billingInfo ??
        raw?.recipientInfo ??
        raw?.contact ??
        raw?.contactDetails
    ) || false;
  return !(hasTransaction && hasShipping && hasCustomer && hasDeliveryMethod);
}

export async function fetchOrderDetails(params: {
  orderId: string;
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}) {
  const accessToken = await fetchAccessToken({
    siteId: params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;

  // If no siteId but we have instanceId, try to resolve siteId from instance
  let siteId = params.siteId ?? null;
  if (!siteId && params.instanceId) {
    try {
      const appInstance = await getAppInstanceDetails({
        instanceId: params.instanceId,
        accessToken,
      });
      siteId = appInstance?.siteId ?? null;
    } catch (error) {
      console.warn("Failed to resolve siteId from instanceId:", error);
    }
  }

  const endpoints = [
    {
      url: `${WIX_API_BASE}/ecom/v1/orders/${params.orderId}`,
      method: "GET" as const,
      body: null as null | string,
    },
    {
      url: `${WIX_API_BASE}/ecom/v1/orders/get`,
      method: "POST" as const,
      body: JSON.stringify({ id: params.orderId }),
    },
  ];

  for (const endpoint of endpoints) {
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(siteId ? { "wix-site-id": siteId } : {}),
      },
      ...(endpoint.body ? { body: endpoint.body } : {}),
    });
    if (!response.ok) continue;
    const data = await response.json().catch(() => null);
    const order = data?.order ?? data?.data ?? data ?? null;
    if (order) return order;
  }
  return null;
}

export async function fetchTransactionRefForOrder(params: {
  orderId: string;
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}) {
  const accessToken = await fetchAccessToken({
    siteId: params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;

  // If no siteId but we have instanceId, try to resolve siteId from instance
  let siteId = params.siteId ?? null;
  if (!siteId && params.instanceId) {
    try {
      const appInstance = await getAppInstanceDetails({
        instanceId: params.instanceId,
        accessToken,
      });
      siteId = appInstance?.siteId ?? null;
    } catch (error) {
      console.warn("Failed to resolve siteId from instanceId:", error);
    }
  }

  const response = await fetch(`${WIX_API_BASE}/payments/v1/transactions/query`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(siteId ? { "wix-site-id": siteId } : {}),
    },
    body: JSON.stringify({
      filter: { orderId: { $eq: params.orderId } },
      paging: { limit: 1 },
    }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const tx =
    data?.transactions?.[0] ??
    data?.items?.[0] ??
    data?.data?.[0] ??
    null;
  const transactionRef =
    tx?.providerTransactionId ??
    tx?.providerPaymentId ??
    tx?.transactionId ??
    tx?.id ??
    tx?.chargeId ??
    tx?.paymentId ??
    tx?.gatewayTransactionId ??
    null;
  if (transactionRef) return transactionRef;
  const orderTx = await fetchOrderTransactionsForOrder({
    orderId: params.orderId,
    siteId: siteId ?? params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const payment = pickPaymentFromOrderTransactions(orderTx);
  return (
    extractTransactionRefFromPayment(payment) ??
    payment?.regularPaymentDetails?.providerTransactionId ??
    null
  );
}

export async function fetchOrderTransactionsForOrder(params: {
  orderId: string;
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}) {
  const accessToken = await fetchAccessToken({
    siteId: params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;

  // If no siteId but we have instanceId, try to resolve siteId from instance
  let siteId = params.siteId ?? null;
  if (!siteId && params.instanceId) {
    try {
      const appInstance = await getAppInstanceDetails({
        instanceId: params.instanceId,
        accessToken,
      });
      siteId = appInstance?.siteId ?? null;
    } catch (error) {
      console.warn("Failed to resolve siteId from instanceId:", error);
    }
  }

  // First try the query endpoint which is more reliable
  const queryEndpoints = [
    "https://manage.wix.com/_api/ecom-payments/v1/payments/query",
    `${WIX_API_BASE}/_api/ecom-payments/v1/payments/query`,
  ];

  for (const endpoint of queryEndpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          ...(siteId ? { "wix-site-id": siteId } : {}),
        },
        body: JSON.stringify({
          filter: { orderId: { $eq: params.orderId } },
          paging: { limit: 10 },
        }),
      });
      if (!response.ok) continue;
      const data = await response.json().catch(() => null);
      if (!data) continue;

      // Check if we got orderTransactions with matching orderId
      const orderTxList = data?.orderTransactions ?? [];
      const matchingTx = orderTxList.find(
        (tx: any) => tx?.orderId === params.orderId
      );
      if (matchingTx) {
        return { orderTransactions: matchingTx, payments: matchingTx?.payments };
      }

      // If filter didn't work, the endpoint may return all - search locally
      if (orderTxList.length > 0) {
        const localMatch = orderTxList.find(
          (tx: any) => tx?.orderId === params.orderId
        );
        if (localMatch) {
          return { orderTransactions: localMatch, payments: localMatch?.payments };
        }
      }
    } catch (e) {
      console.warn("Query endpoint failed:", endpoint, e);
    }
  }

  // Fallback to direct order endpoints
  const endpoints = [
    `${WIX_API_BASE}/ecom/v1/payments/orders/${params.orderId}`,
    `${WIX_API_BASE}/v1/payments/orders/${params.orderId}`,
    `${WIX_API_BASE}/_api/ecom-payments/v1/payments/orders/${params.orderId}`,
    `${WIX_API_BASE}/_api/payments/v1/payments/orders/${params.orderId}`,
    `https://manage.wix.com/_api/ecom-payments/v1/payments/orders/${params.orderId}`,
  ];
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(siteId ? { "wix-site-id": siteId } : {}),
      },
    });
    if (!response.ok) continue;
    const data = await response.json().catch(() => null);
    if (data?.orderTransactions || data?.payments || data?.orderTransactions?.payments) {
      return data;
    }
  }
  return null;
}

// Fetch all payments for a site - useful for batch processing
export async function fetchAllSitePayments(params: {
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
  limit?: number;
}) {
  const accessToken = await fetchAccessToken({
    siteId: params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;
  const siteId = params.siteId ?? null;

  const endpoint = "https://manage.wix.com/_api/ecom-payments/v1/payments/query";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(siteId ? { "wix-site-id": siteId } : {}),
      },
      body: JSON.stringify({
        paging: { limit: params.limit ?? 500 },
      }),
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    return data?.orderTransactions ?? null;
  } catch (e) {
    console.warn("Fetch all payments failed:", e);
    return null;
  }
}

// Find payment for specific order from batch payment data
export function findPaymentForOrder(
  orderTransactions: any[],
  orderId: string
): any | null {
  if (!Array.isArray(orderTransactions)) return null;
  const match = orderTransactions.find((tx) => tx?.orderId === orderId);
  if (!match) return null;
  const payments = match?.payments ?? [];
  // Return the first approved/completed payment, or the first one
  const approved = payments.find(
    (p: any) =>
      p?.regularPaymentDetails?.status === "APPROVED" ||
      p?.regularPaymentDetails?.status === "COMPLETED"
  );
  return approved ?? payments[0] ?? null;
}

function pickPaymentFromOrderTransactions(orderTx: any) {
  if (!orderTx) return null;
  const orderTransactions =
    orderTx?.orderTransactions ??
    orderTx?.orderTransactions?.[0] ??
    orderTx?.transactions?.[0] ??
    orderTx?.data?.orderTransactions ??
    orderTx?.data?.orderTransactions?.[0] ??
    orderTx?.data ??
    null;
  const paymentsCandidate =
    orderTransactions?.payments ??
    orderTransactions?.payments?.[0]?.payment ??
    orderTransactions?.payment ??
    null;
  if (Array.isArray(paymentsCandidate)) {
    // Prioritize payments with valid status (APPROVED, COMPLETED, REFUNDED)
    // over pending ones (PENDING_MERCHANT)
    const validStatuses = ["APPROVED", "COMPLETED", "REFUNDED"];
    const validPayment = paymentsCandidate.find(
      (p: any) => validStatuses.includes(p?.regularPaymentDetails?.status)
    );
    return validPayment ?? paymentsCandidate[0] ?? null;
  }
  return paymentsCandidate;
}

function extractPaymentSummaryFromOrderTransactions(orderTx: any) {
  const payment = pickPaymentFromOrderTransactions(orderTx);
  return {
    payment,
    summary: extractPaymentSummaryFromPayment(payment),
    transactionRef: extractTransactionRefFromPayment(payment),
    paidAt: extractPaidAtFromPayment(payment),
  };
}
export async function fetchPaymentDetailsById(params: {
  paymentId: string;
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}) {
  const accessToken = await fetchAccessToken({
    siteId: params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;
  const siteId = params.siteId ?? null;
  const endpoints = [
    {
      url: `${WIX_API_BASE}/payments/v1/payments/${params.paymentId}`,
      method: "GET" as const,
      body: null as null | string,
    },
    {
      url: `${WIX_API_BASE}/ecom/v1/payments/${params.paymentId}`,
      method: "GET" as const,
      body: null as null | string,
    },
    {
      url: `${WIX_API_BASE}/_api/ecom-payments/v1/payments/${params.paymentId}`,
      method: "GET" as const,
      body: null as null | string,
    },
    {
      url: `${WIX_API_BASE}/_api/payments/v1/payments/${params.paymentId}`,
      method: "GET" as const,
      body: null as null | string,
    },
    {
      url: `${WIX_API_BASE}/payments/v1/payments/get`,
      method: "POST" as const,
      body: JSON.stringify({ id: params.paymentId }),
    },
    {
      url: `${WIX_API_BASE}/ecom/v1/payments/get`,
      method: "POST" as const,
      body: JSON.stringify({ id: params.paymentId }),
    },
    {
      url: `${WIX_API_BASE}/_api/ecom-payments/v1/payments/get`,
      method: "POST" as const,
      body: JSON.stringify({ id: params.paymentId }),
    },
    {
      url: `${WIX_API_BASE}/_api/payments/v1/payments/get`,
      method: "POST" as const,
      body: JSON.stringify({ id: params.paymentId }),
    },
  ];
  for (const endpoint of endpoints) {
    const response = await fetch(endpoint.url, {
      method: endpoint.method,
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(siteId ? { "wix-site-id": siteId } : {}),
      },
      ...(endpoint.body ? { body: endpoint.body } : {}),
    });
    if (!response.ok) continue;
    const data = await response.json().catch(() => null);
    const payment = data?.payment ?? data?.data ?? data ?? null;
    if (payment) return payment;
  }
  return null;
}

export function extractPaidAtFromPayment(payment: any): string | null {
  if (!payment) return null;
  const candidate =
    payment?.paidDate ??
    payment?.paidAt ??
    payment?.statusDate ??
    payment?.completedDate ??
    payment?.createdDate ??
    payment?.createdAt ??
    payment?.updatedDate ??
    payment?.updatedAt ??
    null;
  if (!candidate) return null;
  if (typeof candidate === "string" || typeof candidate === "number") {
    return String(candidate);
  }
  if (typeof candidate === "object") {
    return (
      candidate?.value ??
      candidate?.date ??
      candidate?.timestamp ??
      candidate?.formattedDate ??
      null
    );
  }
  return null;
}

export function extractTransactionRefFromPayment(payment: any): string | null {
  if (!payment) return null;
  const stripeRef = findStripeId(payment);
  return (
    stripeRef ??
    payment?.regularPaymentDetails?.providerTransactionId ??
    payment?.regularPaymentDetails?.gatewayTransactionId ??
    payment?.regularPaymentDetails?.paymentOrderId ??
    payment?.providerPaymentId ??
    payment?.providerTransactionId ??
    payment?.gatewayTransactionId ??
    payment?.gatewayReferenceId ??
    payment?.paymentId ??
    payment?.id ??
    payment?.transactionId ??
    payment?.externalTransactionId ??
    payment?.stripePaymentId ??
    null
  );
}

export function extractPaymentSummaryFromPayment(payment: any): {
  methodText: string | null;
  methodLabel: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
} | null {
  if (!payment) return null;
  const methodLabel =
    (payment?.regularPaymentDetails?.offlinePayment ? "Offline" : null) ??
    payment?.regularPaymentDetails?.paymentMethod ??
    payment?.method?.displayName ??
    payment?.method?.name ??
    payment?.method?.type ??
    payment?.paymentMethodDetails?.displayName ??
    payment?.paymentMethodDetails?.name ??
    payment?.paymentMethodDetails?.type ??
    payment?.paymentMethod?.displayName ??
    payment?.paymentMethod?.name ??
    payment?.paymentMethod?.type ??
    payment?.paymentMethod ??
    payment?.paymentMethodType ??
    payment?.method ??
    payment?.type ??
    payment?.provider ??
    payment?.paymentType ??
    null;
  const methodText = String(methodLabel ?? "").toLowerCase();
  const card =
    payment?.regularPaymentDetails?.creditCardDetails ??
    payment?.card ??
    payment?.paymentMethodDetails?.card ??
    payment?.paymentMethod?.card ??
    null;
  const cardBrand =
    card?.brand ??
    card?.type ??
    card?.brandName ??
    payment?.cardBrand ??
    payment?.cardProvider ??
    payment?.cardType ??
    null;
  const cardLast4 =
    card?.last4 ??
    card?.lastFourDigits ??
    payment?.cardLast4 ??
    payment?.last4 ??
    null;
  return {
    methodText: methodText || null,
    methodLabel: methodLabel ? String(methodLabel) : null,
    cardBrand: cardBrand || null,
    cardLast4: cardLast4 || null,
  };
}

export function extractDeliveryMethodFromOrder(raw: any): string | null {
  const candidate =
    raw?.udito?.deliveryMethod ??
    raw?.shippingInfo?.title ??
    raw?.shippingInfo?.shipmentDetails?.methodName ??
    raw?.shippingInfo?.shipmentDetails?.deliveryMethod ??
    raw?.shippingInfo?.shippingMethodName ??
    raw?.shippingInfo?.shippingService?.name ??
    raw?.shippingInfo?.deliveryOption?.title ??
    raw?.shippingInfo?.deliveryOption?.name ??
    raw?.shippingInfo?.shippingOption?.title ??
    raw?.shippingInfo?.shippingOption?.name ??
    raw?.shippingInfo?.deliveryMethod?.name ??
    raw?.shippingInfo?.deliveryMethod?.type ??
    raw?.deliveryInfo?.deliveryOption?.title ??
    raw?.deliveryInfo?.deliveryOption?.name ??
    raw?.deliveryInfo?.deliveryMethod?.name ??
    raw?.deliveryInfo?.deliveryMethod?.type ??
    raw?.deliveryMethod?.displayName ??
    raw?.deliveryMethod?.name ??
    raw?.deliveryMethod?.type ??
    raw?.delivery?.method?.name ??
    raw?.delivery?.method?.type ??
    raw?.deliveryDetails?.method ??
    raw?.deliveryDetails?.name ??
    raw?.deliveryOption?.title ??
    raw?.deliveryOption?.name ??
    raw?.fulfillmentInfo?.deliveryMethod?.name ??
    raw?.fulfillments?.[0]?.deliveryMethod?.name ??
    raw?.fulfillments?.[0]?.deliveryMethod?.type ??
    raw?.fulfillments?.[0]?.shippingMethodName ??
    raw?.fulfillments?.[0]?.trackingInfo?.shippingProvider ??
    null;
  if (!candidate) return null;
  if (typeof candidate === "string") return candidate;
  if (typeof candidate === "object") {
    return (
      candidate?.translated ??
      candidate?.translation ??
      candidate?.name ??
      candidate?.title ??
      candidate?.value ??
      null
    );
  }
  return null;
}

export async function fetchPaymentIdForOrder(params: {
  orderId: string;
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}) {
  const accessToken = await fetchAccessToken({
    siteId: params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;
  const siteId = params.siteId ?? null;
  const response = await fetch(`${WIX_API_BASE}/payments/v1/payments/query`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(siteId ? { "wix-site-id": siteId } : {}),
    },
    body: JSON.stringify({
      filter: { orderId: { $eq: params.orderId } },
      paging: { limit: 1 },
    }),
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const payment =
    data?.payments?.[0] ??
    data?.items?.[0] ??
    data?.data?.[0] ??
    null;
  const paymentId = payment?.id ?? payment?.paymentId ?? null;
  if (paymentId) return paymentId;
  const orderTx = await fetchOrderTransactionsForOrder({
    orderId: params.orderId,
    siteId: params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const paymentFromTx = pickPaymentFromOrderTransactions(orderTx);
  return paymentFromTx?.id ?? paymentFromTx?.paymentId ?? null;
}

export async function fetchPaymentRecordForOrder(params: {
  orderId: string;
  orderNumber?: string | null;
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}) {
  const accessToken = await fetchAccessToken({
    siteId: params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;
  const siteId = params.siteId ?? null;
  const filters = [
    { orderId: { $eq: params.orderId } },
    params.orderNumber ? { orderNumber: { $eq: params.orderNumber } } : null,
    params.orderNumber ? { referenceId: { $eq: params.orderNumber } } : null,
  ].filter(Boolean) as Array<Record<string, unknown>>;

  for (const filter of filters) {
    const response = await fetch(`${WIX_API_BASE}/payments/v1/payments/query`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(siteId ? { "wix-site-id": siteId } : {}),
      },
      body: JSON.stringify({
        filter,
        paging: { limit: 1 },
      }),
    });
    if (!response.ok) {
      continue;
    }
    const data = await response.json().catch(() => null);
    const payment =
      data?.payments?.[0] ??
      data?.items?.[0] ??
      data?.data?.[0] ??
      null;
    if (!payment) continue;
    const paymentId = payment?.id ?? payment?.paymentId ?? null;
    const transactionRef = extractTransactionRefFromPayment(payment);
    const paidAt = extractPaidAtFromPayment(payment);
    const paymentSummary = extractPaymentSummaryFromPayment(payment);
    return { paymentId, transactionRef, paidAt, payment, paymentSummary };
  }
  const orderTx = await fetchOrderTransactionsForOrder({
    orderId: params.orderId,
    siteId: params.siteId ?? null,
    instanceId: params.instanceId ?? null,
    businessId: params.businessId ?? null,
  });
  const { payment, summary, transactionRef, paidAt } =
    extractPaymentSummaryFromOrderTransactions(orderTx);
  return {
    paymentId: payment?.id ?? payment?.paymentId ?? null,
    transactionRef,
    paidAt,
    payment,
    paymentSummary: summary,
  };
}

export function pickOrderFields(raw: any, source: "webhook" | "backfill") {
  const buyer = raw?.buyerInfo || raw?.buyer || raw?.customerInfo || raw?.customer || {};
  const billingContact =
    raw?.billingInfo?.contactDetails ||
    raw?.billingInfo?.address ||
    raw?.billingInfo ||
    {};
  const recipientContact =
    raw?.recipientInfo?.contactDetails ||
    raw?.recipientInfo ||
    raw?.shippingInfo?.shipmentDetails?.address ||
    raw?.shippingInfo?.deliveryAddress ||
    raw?.shippingAddress ||
    {};
  const totals =
    raw?.priceSummary ||
    raw?.totals ||
    raw?.payNow ||
    raw?.price ||
    raw?.balanceSummary ||
    {};

  const readDateValue = (value: any) => {
    if (!value) return null;
    if (typeof value === "string" || typeof value === "number") return value;
    if (typeof value === "object") {
      return (
        value?.value ??
        value?.date ??
        value?.timestamp ??
        value?.formattedDate ??
        null
      );
    }
    return null;
  };

  const parseNumeric = (input: unknown) => {
    if (typeof input === "number") {
      return Number.isFinite(input) ? input : null;
    }
    if (typeof input === "string") {
      const normalized = input.replace(",", ".").replace(/[^0-9.-]+/g, "");
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const readMoney = (value: any) => {
    if (value == null) return { amount: null, currency: null };
    if (typeof value === "number") return { amount: parseNumeric(value), currency: null };
    if (typeof value === "string") {
      return { amount: parseNumeric(value), currency: null };
    }
    if (typeof value === "object") {
      const amountValue =
        value?.amount ??
        value?.value ??
        value?.money ??
        value?.total ??
        value?.totalAmount ??
        null;
      const currencyValue = value?.currency ?? value?.currencyCode ?? null;
      if (typeof amountValue === "object") {
        const nestedAmount =
          amountValue?.value ?? amountValue?.amount ?? amountValue?.total ?? null;
        const nestedCurrency =
          amountValue?.currency ?? amountValue?.currencyCode ?? currencyValue;
        return {
          amount: parseNumeric(nestedAmount),
          currency: nestedCurrency ?? null,
        };
      }
      return {
        amount: parseNumeric(amountValue),
        currency: currencyValue ?? null,
      };
    }
    return { amount: null, currency: null };
  };

  const totalMoney = readMoney(
    totals?.total ??
      totals?.totalAmount ??
      totals?.amount ??
      totals?.paid ??
      totals?.balance ??
      totals?.grandTotal ??
      totals?.totalPrice ??
      totals
  );
  const subtotalMoney = readMoney(
    totals?.subtotal ?? totals?.subtotalAmount ?? totals?.subTotal
  );
  const taxMoney = readMoney(totals?.tax ?? totals?.taxAmount ?? totals?.vat);
  const shippingMoney = readMoney(
    totals?.shipping ?? totals?.shippingAmount ?? totals?.delivery
  );
  const discountMoney = readMoney(
    totals?.discount ?? totals?.discountAmount ?? totals?.coupon
  );
  const currency =
    totals?.currency ??
    totalMoney.currency ??
    subtotalMoney.currency ??
    raw?.currency ??
    raw?.buyerCurrency ??
    null;

  const extractPaidDate = () => {
    if (raw?.udito?.paidAt) return raw.udito.paidAt;
    if (raw?.paidDate || raw?.paymentDate) return raw?.paidDate ?? raw?.paymentDate;
    const activities = Array.isArray(raw?.activities) ? raw.activities : [];
    const paid = activities.find(
      (activity: any) => activity?.type === "ORDER_PAID"
    );
    return paid?.createdDate ?? null;
  };

  const customerName =
    buyer?.name ||
    [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ") ||
    [buyer?.givenName, buyer?.familyName].filter(Boolean).join(" ") ||
    [billingContact?.firstName, billingContact?.lastName]
      .filter(Boolean)
      .join(" ") ||
    [billingContact?.givenName, billingContact?.familyName]
      .filter(Boolean)
      .join(" ") ||
    [recipientContact?.firstName, recipientContact?.lastName]
      .filter(Boolean)
      .join(" ") ||
    [recipientContact?.givenName, recipientContact?.familyName]
      .filter(Boolean)
      .join(" ") ||
    [raw?.contactDetails?.firstName, raw?.contactDetails?.lastName]
      .filter(Boolean)
      .join(" ") ||
    [raw?.contact?.firstName, raw?.contact?.lastName]
      .filter(Boolean)
      .join(" ") ||
    null;

  const customerEmail =
    buyer?.email ??
    billingContact?.email ??
    recipientContact?.email ??
    raw?.contactDetails?.email ??
    raw?.buyerEmail ??
    null;

  return {
    id: raw?.id ?? raw?._id ?? raw?.orderId,
    // IMPORTANT: Never fallback to instanceId - they are NOT the same!
    siteId: raw?.siteId ?? raw?.site_id ?? null,
    number:
      raw?.number ??
      raw?.orderNumber?.number ??
      raw?.orderNumber?.displayNumber ??
      raw?.orderNumber ??
      raw?.displayId ??
      null,
    status: raw?.status ?? raw?.fulfillmentStatus ?? null,
    paymentStatus:
      raw?.paymentStatus ??
      raw?.paymentStatus?.status ??
      raw?.financialStatus ??
      null,
    createdAt: readDateValue(
      raw?.createdDate ?? raw?.createdAt ?? raw?.purchasedDate ?? raw?.createdOn
    ),
    updatedAt: readDateValue(raw?.updatedDate ?? raw?.updatedAt),
    paidAt: readDateValue(extractPaidDate()),
    currency,
    subtotal: subtotalMoney.amount,
    taxTotal: taxMoney.amount,
    shippingTotal: shippingMoney.amount,
    discountTotal: discountMoney.amount,
    total: totalMoney.amount,
    customerEmail,
    customerName,
    source,
    raw,
  };
}
