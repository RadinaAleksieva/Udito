import { getLatestWixToken } from "@/lib/db";

type WixOrderQueryResponse = {
  orders?: unknown[];
  results?: unknown[];
  items?: unknown[];
  order?: unknown;
  metadata?: {
    paging?: {
      cursor?: string | null;
    };
  };
  paging?: {
    cursor?: string | null;
    nextCursor?: string | null;
  };
};

const WIX_API_BASE = process.env.WIX_API_BASE || "https://www.wixapis.com";

async function fetchAccessToken(): Promise<string> {
  if (process.env.WIX_ACCESS_TOKEN) {
    return process.env.WIX_ACCESS_TOKEN;
  }

  const dbToken = await getLatestWixToken();
  if (dbToken?.access_token) {
    return dbToken.access_token;
  }

  const clientId = process.env.WIX_APP_ID;
  const clientSecret = process.env.WIX_APP_SECRET;
  const refreshToken = process.env.WIX_REFRESH_TOKEN || dbToken?.refresh_token;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Missing Wix access token or refresh credentials.");
  }

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

  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error("Wix token refresh returned no access_token.");
  }

  return data.access_token;
}

export async function queryPaidOrders(options: {
  startDateIso: string;
  cursor?: string | null;
  limit?: number;
}) {
  const accessToken = await fetchAccessToken();
  const tokenMeta = await getLatestWixToken();
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;
  const siteId = process.env.WIX_SITE_ID || tokenMeta?.site_id || "";
  const limit = options.limit ?? 100;

  const response = await fetch(`${WIX_API_BASE}/ecom/v1/orders/query`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(siteId ? { "wix-site-id": siteId } : {}),
    },
    body: JSON.stringify({
      query: {
        filter: {
          paymentStatus: { $eq: "PAID" },
          createdDate: { $gte: options.startDateIso },
        },
        paging: {
          limit,
          cursor: options.cursor ?? undefined,
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

  const cursor =
    data.metadata?.paging?.cursor ?? data.paging?.nextCursor ?? null;

  return { orders, cursor };
}

export function pickOrderFields(raw: any, source: "webhook" | "backfill") {
  const buyer = raw?.buyerInfo || raw?.buyer || {};
  const totals = raw?.priceSummary || raw?.totals || {};

  return {
    id: raw?.id ?? raw?._id ?? raw?.orderId,
    siteId: raw?.siteId ?? raw?.site_id ?? null,
    number: raw?.number ?? raw?.orderNumber ?? null,
    status: raw?.status ?? raw?.fulfillmentStatus ?? null,
    paymentStatus: raw?.paymentStatus ?? raw?.financialStatus ?? null,
    createdAt: raw?.createdDate ?? raw?.createdAt ?? null,
    updatedAt: raw?.updatedDate ?? raw?.updatedAt ?? null,
    paidAt: raw?.paidDate ?? raw?.paymentDate ?? null,
    currency: totals?.currency ?? raw?.currency ?? null,
    subtotal: totals?.subtotal ?? totals?.subtotalAmount ?? null,
    taxTotal: totals?.tax ?? totals?.taxAmount ?? null,
    shippingTotal: totals?.shipping ?? totals?.shippingAmount ?? null,
    discountTotal: totals?.discount ?? totals?.discountAmount ?? null,
    total: totals?.total ?? totals?.totalAmount ?? null,
    customerEmail: buyer?.email ?? raw?.buyerEmail ?? null,
    customerName:
      buyer?.name ??
      [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ") ??
      null,
    source,
    raw,
  };
}
