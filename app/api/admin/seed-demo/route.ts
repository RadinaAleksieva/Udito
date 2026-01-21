import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { upsertTenantOrder, TenantOrder, tenantTablesExist, createTenantTables } from "@/lib/tenant-db";
import { issueReceipt } from "@/lib/receipts";

function requireSecret(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured.");
  }
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    throw new Error("Unauthorized.");
  }
}

const demoOrders = [
  {
    number: "TEST-0001",
    total: "24.90",
    subtotal: "20.75",
    tax: "4.15",
    items: [
      {
        name: "Комплект на мечтателя",
        quantity: 1,
        price: "24.90",
        taxPercent: "20",
        taxAmount: "4.15",
        discount: "0.00",
        externalProductIdentities: ["WR-001"],
      },
    ],
  },
  {
    number: "TEST-0002",
    total: "58.00",
    subtotal: "48.33",
    tax: "9.67",
    items: [
      {
        name: "Гривна The Rabbit",
        quantity: 2,
        price: "29.00",
        taxPercent: "20",
        taxAmount: "9.67",
        discount: "0.00",
        externalProductIdentities: ["WR-012"],
      },
    ],
  },
  {
    number: "TEST-0003",
    total: "12.50",
    subtotal: "10.42",
    tax: "2.08",
    items: [
      {
        name: "Мини гривна",
        quantity: 1,
        price: "12.50",
        taxPercent: "20",
        taxAmount: "2.08",
        discount: "0.00",
        externalProductIdentities: ["WR-020"],
      },
    ],
  },
  {
    number: "TEST-0004",
    total: "199.00",
    subtotal: "165.83",
    tax: "33.17",
    items: [
      {
        name: "Сребърен комплект",
        quantity: 1,
        price: "199.00",
        taxPercent: "20",
        taxAmount: "33.17",
        discount: "0.00",
        externalProductIdentities: ["WR-100"],
      },
    ],
  },
  {
    number: "TEST-0005",
    total: "6.40",
    subtotal: "5.33",
    tax: "1.07",
    items: [
      {
        name: "Стикер The Rabbit",
        quantity: 2,
        price: "3.20",
        taxPercent: "20",
        taxAmount: "1.07",
        discount: "0.00",
        externalProductIdentities: ["WR-200"],
      },
    ],
  },
];

export async function POST(request: Request) {
  try {
    requireSecret(request);
    await initDb();
    const url = new URL(request.url);
    const siteId = url.searchParams.get("siteId") || "demo-site";
    const now = Date.now();
    const inserted: string[] = [];

    // Ensure tenant tables exist
    const tablesExist = await tenantTablesExist(siteId);
    if (!tablesExist) {
      await createTenantTables(siteId);
    }

    for (let i = 0; i < demoOrders.length; i += 1) {
      const orderId = `demo_${now + i}`;
      const createdAt = new Date(now - i * 3600_000).toISOString();
      const demo = demoOrders[i];
      const raw = {
        lineItems: demo.items,
        priceSummary: {
          subtotal: demo.subtotal,
          shipping: "0.00",
          tax: demo.tax,
          discount: "0.00",
          total: demo.total,
        },
        shippingAddress: {
          addressLine1: "ул. Деспот Слав 13",
          city: "София",
          country: "България",
          postalCode: "1618",
        },
        paymentMethod: {
          name: "Visa",
          cardProvider: "Visa",
          cardLast4: "4832",
          transactionId: "TRX-DEMO",
        },
        demo: true,
      };
      const tenantOrder: TenantOrder = {
        id: orderId,
        number: demo.number,
        status: "CREATED",
        paymentStatus: "PAID",
        createdAt,
        updatedAt: createdAt,
        paidAt: createdAt,
        currency: "BGN",
        subtotal: parseFloat(demo.subtotal),
        taxTotal: parseFloat(demo.tax),
        shippingTotal: 0,
        discountTotal: 0,
        total: parseFloat(demo.total),
        customerEmail: "test@example.com",
        customerName: "Test Customer",
        source: "backfill",
        raw,
      };
      await upsertTenantOrder(siteId, tenantOrder);
      await issueReceipt({ orderId, payload: { ...tenantOrder, siteId }, businessId: null });
      inserted.push(orderId);
    }

    return NextResponse.json({ ok: true, inserted });
  } catch (error) {
    console.error("Seed demo orders failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 401 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
