import { NextRequest, NextResponse } from "next/server";
import { initDb, upsertOrder } from "@/lib/db";
import { getAccessToken, pickOrderFields, extractTransactionRef, extractDeliveryMethodFromOrder, fetchTransactionRefForOrder, fetchPaymentRecordForOrder, fetchOrderTransactionsForOrder, extractPaymentSummaryFromPayment } from "@/lib/wix";

export const maxDuration = 300; // 5 minutes for long-running sync

async function fetchAllOrdersFromWix(accessToken: string, siteId: string) {
  const orders: any[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const authHeader = accessToken.startsWith('Bearer ')
      ? accessToken
      : `Bearer ${accessToken}`;

    const response = await fetch(
      `https://www.wixapis.com/ecom/v1/orders/query`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "wix-site-id": siteId,
        },
        body: JSON.stringify({
          query: {
            paging: {
              limit,
              offset,
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to fetch orders:", response.status, errorText);
      break;
    }

    const data = await response.json();
    const fetchedOrders = data?.orders || [];

    console.log(`Fetched ${fetchedOrders.length} orders in this batch`);
    console.log('Response metadata:', JSON.stringify(data?.metadata || data?.paging || {}));

    if (fetchedOrders.length === 0) {
      console.log('No more orders to fetch');
      break;
    }

    orders.push(...fetchedOrders);

    // Check if there are more pages
    offset += fetchedOrders.length;

    // If we got less than the limit, we've reached the end
    if (fetchedOrders.length < limit) {
      console.log('Reached end of orders');
      break;
    }

    // Safety limit
    if (orders.length >= 1000) {
      console.warn("Reached safety limit of 1000 orders");
      break;
    }
  }

  return orders;
}

export async function POST(request: NextRequest) {
  const { siteId } = await request.json().catch(() => ({ siteId: null }));

  if (!siteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  await initDb();

  try {
    // Get fresh access token (auto-refreshes if needed)
    console.log("Getting access token for site", siteId);
    const accessToken = await getAccessToken({ siteId });

    console.log("Starting initial sync for site", siteId);
    console.log("Access token format:", accessToken.substring(0, 20) + "...");

    // Fetch all orders from Wix
    const orders = await fetchAllOrdersFromWix(accessToken, siteId);

    console.log(`Fetched ${orders.length} orders from Wix`);

    let synced = 0;
    let errors = 0;

    // Process each order - simplified for speed
    // Note: Only extracting data already in the order object
    // Payment details enrichment will happen via webhooks or on-demand
    for (const rawOrder of orders) {
      try {
        let orderRaw: any = rawOrder;

        // Extract transaction ref from existing data (no API call)
        const transactionRef = extractTransactionRef(orderRaw);

        // Extract delivery method from existing data (no API call)
        const deliveryMethod = extractDeliveryMethodFromOrder(orderRaw);

        // Add extracted data to udito object if present
        if (transactionRef || deliveryMethod) {
          orderRaw = {
            ...orderRaw,
            udito: {
              ...(orderRaw.udito ?? {}),
              ...(transactionRef ? { transactionRef } : {}),
              ...(deliveryMethod ? { deliveryMethod } : {}),
            },
          };
        }

        const mapped = pickOrderFields(orderRaw, "webhook");

        // Upsert to database
        await upsertOrder({
          ...mapped,
          businessId: null,
          raw: orderRaw,
        });

        synced++;

        // Log progress every 10 orders
        if (synced % 10 === 0) {
          console.log(`Synced ${synced}/${orders.length} orders...`);
        }
      } catch (error) {
        errors++;
        console.error(`Error syncing order ${rawOrder.number}:`, error);
      }
    }

    console.log(`✅ Initial sync complete: ${synced} orders synced, ${errors} errors`);

    return NextResponse.json({
      success: true,
      synced,
      errors,
      total: orders.length,
    });
  } catch (error) {
    console.error("Initial sync failed:", error);
    return NextResponse.json(
      {
        error: "Initial sync failed",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
