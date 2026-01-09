import { NextRequest, NextResponse } from "next/server";
import { initDb, getLatestWixTokenForSite, upsertOrder } from "@/lib/db";
import { pickOrderFields, extractTransactionRef, extractDeliveryMethodFromOrder, fetchTransactionRefForOrder, fetchPaymentRecordForOrder, fetchOrderTransactionsForOrder, extractPaymentSummaryFromPayment } from "@/lib/wix";

export const maxDuration = 300; // 5 minutes for long-running sync

async function fetchAllOrdersFromWix(accessToken: string, siteId: string) {
  const orders: any[] = [];
  let cursor: string | undefined;
  const limit = 100;

  while (true) {
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      ...(cursor ? { cursor } : {}),
    });

    const response = await fetch(
      `https://www.wixapis.com/ecom/v1/orders?${queryParams.toString()}`,
      {
        headers: {
          Authorization: accessToken,
          "wix-site-id": siteId,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Failed to fetch orders:", response.status, errorText);
      break;
    }

    const data = await response.json();
    const fetchedOrders = data?.orders || [];

    if (fetchedOrders.length === 0) break;

    orders.push(...fetchedOrders);

    // Check if there are more pages
    if (data?.metadata?.cursors?.next) {
      cursor = data.metadata.cursors.next;
    } else {
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
    // Get access token for this site
    const tokens = await getLatestWixTokenForSite({ siteId });

    if (!tokens || !tokens.access_token) {
      return NextResponse.json(
        { error: "No access token found for this site" },
        { status: 401 }
      );
    }

    console.log("Starting initial sync for site", siteId);
    console.log("Access token format:", tokens.access_token?.substring(0, 20) + "...");

    // Fetch all orders from Wix
    const orders = await fetchAllOrdersFromWix(tokens.access_token, siteId);

    console.log(`Fetched ${orders.length} orders from Wix`);

    let synced = 0;
    let errors = 0;

    // Process each order
    for (const rawOrder of orders) {
      try {
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
            siteId: base.siteId ?? siteId,
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
            siteId: base.siteId ?? siteId,
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
              siteId: base.siteId ?? siteId,
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
