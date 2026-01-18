import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { queryOrders, pickOrderFields, extractTransactionRef, extractDeliveryMethodFromOrder } from "@/lib/wix";
import { initDb, upsertOrder, sql } from "@/lib/db";
import { upsertTenantOrder, TenantOrder, tenantTablesExist, createTenantTables } from "@/lib/tenant-db";

// Check if user is admin
function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  // Verify admin access
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { siteId, days = 7 } = await request.json();

  // Use provided siteId or fallback to default
  const targetSiteId = siteId || process.env.WIX_SITE_ID || null;

  if (!targetSiteId) {
    return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
  }

  await initDb();

  try {
    console.log("Syncing recent orders for site", targetSiteId, "days:", days);

    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateIso = startDate.toISOString();

    // Ensure tenant tables exist
    const tablesExist = await tenantTablesExist(targetSiteId);
    if (!tablesExist) {
      await createTenantTables(targetSiteId);
    }

    let syncedCount = 0;
    let archivedCount = 0;
    let cursor: string | null = null;
    const limit = 50;

    do {
      const page = await queryOrders({
        startDateIso,
        cursor,
        limit,
        siteId: targetSiteId,
        instanceId: null,
      });

      const orders = page?.orders ?? [];
      cursor = page?.cursor ?? null;

      for (const rawOrder of orders) {
        const base = pickOrderFields(rawOrder, "backfill");
        let orderRaw: any = rawOrder;

        // Extract delivery method
        const deliveryMethod = extractDeliveryMethodFromOrder(orderRaw);
        if (deliveryMethod) {
          orderRaw = {
            ...orderRaw,
            udito: {
              ...(orderRaw.udito ?? {}),
              deliveryMethod,
            },
          };
        }

        // Extract transaction ref
        const transactionRef = extractTransactionRef(orderRaw);
        if (transactionRef) {
          orderRaw = {
            ...orderRaw,
            udito: { ...(orderRaw.udito ?? {}), transactionRef },
          };
        }

        const mapped = pickOrderFields(orderRaw, "backfill");

        // Ensure siteId is set
        if (!mapped.siteId) {
          mapped.siteId = targetSiteId;
        }

        // Check if order is archived
        const isArchived = orderRaw?.archived === true ||
          orderRaw?.isArchived === true ||
          orderRaw?.archivedAt ||
          orderRaw?.archivedDate ||
          String(orderRaw?.status ?? "").toLowerCase().includes("archived");

        if (isArchived) {
          archivedCount++;
        }

        // Upsert to legacy shared table
        await upsertOrder({
          ...mapped,
          businessId: null,
          raw: orderRaw,
        });

        // Also upsert to tenant-specific table
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
          source: "backfill",
          isSynced: true,
          raw: orderRaw,
        };

        await upsertTenantOrder(targetSiteId, tenantOrder);
        syncedCount++;
      }

      console.log(`Synced ${syncedCount} orders so far...`);
    } while (cursor);

    console.log(`✅ Sync complete: ${syncedCount} orders, ${archivedCount} archived`);

    return NextResponse.json({
      success: true,
      syncedCount,
      archivedCount,
      days,
    });

  } catch (error) {
    console.error("Error syncing recent orders:", error);
    return NextResponse.json({
      error: "Failed to sync recent orders",
      details: (error as Error).message
    }, { status: 500 });
  }
}
