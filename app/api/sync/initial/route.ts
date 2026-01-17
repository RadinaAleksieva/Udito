import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { getAccessToken, pickOrderFields, extractTransactionRef, extractDeliveryMethodFromOrder } from "@/lib/wix";
import { upsertTenantOrder, createTenantTables, tenantTablesExist, updateTenantSyncState, TenantOrder } from "@/lib/tenant-db";

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
    // Ensure tenant tables exist
    const tablesExist = await tenantTablesExist(siteId);
    if (!tablesExist) {
      console.log("Creating tenant tables for site:", siteId);
      await createTenantTables(siteId);
    }

    // Update sync state to "running"
    await updateTenantSyncState(siteId, { status: "running" });

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

    // Process each order - mark as is_synced = true (old orders)
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

        const mapped = pickOrderFields(orderRaw, "backfill");

        // Convert to TenantOrder format and mark as synced (old order)
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
          source: "sync",
          isSynced: true, // ✅ Mark as synced (old order) - NOT chargeable
          raw: orderRaw,
        };

        // Upsert to tenant-specific table
        await upsertTenantOrder(siteId, tenantOrder);

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

    // Update sync state to "complete"
    await updateTenantSyncState(siteId, {
      status: "complete",
      cursor: null,
    });

    console.log(`✅ Initial sync complete: ${synced} orders synced, ${errors} errors`);

    return NextResponse.json({
      success: true,
      synced,
      errors,
      total: orders.length,
    });
  } catch (error) {
    console.error("Initial sync failed:", error);

    // Update sync state to "error"
    await updateTenantSyncState(siteId, {
      status: "error",
      lastError: (error as Error).message,
    });

    return NextResponse.json(
      {
        error: "Initial sync failed",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
