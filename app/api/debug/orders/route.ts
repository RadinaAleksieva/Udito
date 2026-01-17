import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { extractTransactionRef } from "@/lib/wix";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const searchNumber = url.searchParams.get("number");
  const detailed = url.searchParams.get("detailed") === "true";

  try {
    // Search for specific order if number provided
    let searchResult = null;
    let orderDetails = null;

    if (searchNumber) {
      // Remove LIMIT 1 to check for duplicates
      const result = await sql`
        SELECT id, number, site_id, status, payment_status, created_at, paid_at, source,
               customer_name, customer_email, total, currency, raw
        FROM orders
        WHERE number = ${searchNumber}
      `;
      searchResult = result.rows;

      // Extract detailed info from raw
      if (result.rows[0] && detailed) {
        const order = result.rows[0];
        const raw = order.raw as any;

        // Extract transaction ref
        const transactionRef = extractTransactionRef(raw);

        // Extract customer info
        const buyer = raw?.buyerInfo ?? raw?.buyer ?? raw?.customerInfo ?? {};
        const billing = raw?.billingInfo?.contactDetails ?? raw?.billingInfo ?? {};
        const customerName = order.customer_name ||
          [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ") ||
          [billing?.firstName, billing?.lastName].filter(Boolean).join(" ");
        const customerEmail = order.customer_email || buyer?.email || billing?.email;
        const customerPhone = buyer?.phone || billing?.phone ||
          raw?.shippingInfo?.shipmentDetails?.address?.phone;

        // Extract totals
        const totals = raw?.priceSummary ?? raw?.totals ?? {};
        const getAmount = (v: any) => v?.amount ?? v?.value ?? v;

        // Extract line items
        const lineItems = raw?.lineItems ?? raw?.items ?? [];
        const items = Array.isArray(lineItems)
          ? lineItems.map((item: any) => ({
              name: item?.productName?.translated ?? item?.productName?.original ?? item?.name ?? "Unknown",
              quantity: item?.quantity ?? 1,
              price: item?.price?.amount ?? item?.price ?? null,
              total: item?.totalPrice?.amount ?? item?.totalPrice ?? null,
            }))
          : [];

        orderDetails = {
          orderNumber: order.number,
          transactionRef: transactionRef ?? "НЕ Е НАМЕРЕН",
          paidAt: order.paid_at,
          customer: {
            name: customerName || "НЕ Е НАМЕРЕН",
            email: customerEmail || "НЕ Е НАМЕРЕН",
            phone: customerPhone || "НЕ Е НАМЕРЕН",
          },
          totals: {
            subtotal: getAmount(totals?.subtotal),
            shipping: getAmount(totals?.shipping),
            tax: getAmount(totals?.tax),
            discount: getAmount(totals?.discount),
            total: order.total ?? getAmount(totals?.total),
            currency: order.currency,
          },
          items,
          rawPaymentMethod: raw?.paymentMethod ?? raw?.paymentMethodSummary ?? null,
          udito: raw?.udito ?? null,
          // Debug: show all shipping-related fields
          shippingDebug: {
            shippingInfo: raw?.shippingInfo ?? null,
            shippingAddress: raw?.shippingAddress ?? null,
            deliveryAddress: raw?.deliveryAddress ?? null,
            recipientInfo: raw?.recipientInfo ?? null,
            billingInfo: raw?.billingInfo ?? null,
          },
        };
      }
    }

    // Get total count of all orders
    const totalCount = await sql`
      SELECT COUNT(*) as count FROM orders
    `;

    // Get recent orders - sorted by number descending to see newest
    const recentOrders = await sql`
      SELECT id, number, site_id, status, payment_status, created_at, paid_at, source
      FROM orders
      ORDER BY CAST(number AS INTEGER) DESC NULLS LAST
      LIMIT 20
    `;

    // Include raw data if showRaw=true for debugging shipping address
    const showRaw = url.searchParams.get("showRaw") === "true";
    return NextResponse.json({
      searchNumber,
      searchResult: searchResult?.map(r => ({
        ...r,
        raw: showRaw ? r.raw : undefined
      })),
      orderDetails,
      totalCount: totalCount.rows[0],
      recentOrders: recentOrders.rows,
    });
  } catch (error) {
    console.error("Debug query failed", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
