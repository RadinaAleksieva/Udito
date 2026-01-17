import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import {
  createTenantTables,
  tenantTablesExist,
  upsertTenantOrder,
  issueTenantReceipt,
  TenantOrder,
  TenantReceipt,
} from "@/lib/tenant-db";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

export const maxDuration = 300; // 5 minutes for long-running migration

/**
 * Migration API endpoint
 * Migrates existing data from shared tables to tenant-specific tables
 *
 * POST /api/admin/migrate-tenants
 * Headers: { "x-admin-secret": "..." }
 * Body: { "siteId": "..." } or { "all": true }
 */
export async function POST(request: NextRequest) {
  // Check admin secret
  const secret = request.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { siteId, all } = body as { siteId?: string; all?: boolean };

  await initDb();

  try {
    // Get list of sites to migrate
    let sitesToMigrate: string[] = [];

    if (siteId) {
      sitesToMigrate = [siteId];
    } else if (all) {
      // Get all unique site_ids from companies table
      const sites = await sql`
        SELECT DISTINCT site_id FROM companies WHERE site_id IS NOT NULL
      `;
      sitesToMigrate = sites.rows.map((r) => r.site_id);
    } else {
      return NextResponse.json(
        { error: "Provide siteId or all=true" },
        { status: 400 }
      );
    }

    console.log(`Starting migration for ${sitesToMigrate.length} sites`);

    const results: Array<{
      siteId: string;
      orders: number;
      receipts: number;
      errors: string[];
    }> = [];

    for (const site of sitesToMigrate) {
      console.log(`Migrating site: ${site}`);
      const siteResult = {
        siteId: site,
        orders: 0,
        receipts: 0,
        errors: [] as string[],
      };

      try {
        // Ensure tenant tables exist
        const exists = await tenantTablesExist(site);
        if (!exists) {
          console.log(`Creating tenant tables for ${site}`);
          await createTenantTables(site);
        }

        // Migrate orders
        const orders = await sql`
          SELECT * FROM orders WHERE site_id = ${site}
        `;

        for (const order of orders.rows) {
          try {
            const tenantOrder: TenantOrder = {
              id: order.id,
              number: order.number,
              status: order.status,
              paymentStatus: order.payment_status,
              createdAt: order.created_at,
              updatedAt: order.updated_at,
              paidAt: order.paid_at,
              currency: order.currency,
              subtotal: order.subtotal,
              taxTotal: order.tax_total,
              shippingTotal: order.shipping_total,
              discountTotal: order.discount_total,
              total: order.total,
              customerEmail: order.customer_email,
              customerName: order.customer_name,
              source: order.source || "migration",
              // Mark all existing orders as synced (old) - not chargeable
              isSynced: true,
              raw: order.raw,
            };

            await upsertTenantOrder(site, tenantOrder);
            siteResult.orders++;
          } catch (orderError) {
            siteResult.errors.push(`Order ${order.id}: ${(orderError as Error).message}`);
          }
        }

        // Migrate receipts
        const receipts = await sql`
          SELECT r.*, o.site_id
          FROM receipts r
          LEFT JOIN orders o ON o.id = r.order_id
          WHERE o.site_id = ${site}
        `;

        for (const receipt of receipts.rows) {
          try {
            const tenantReceipt: TenantReceipt = {
              orderId: receipt.order_id,
              payload: receipt.payload,
              type: receipt.type as 'sale' | 'refund',
              issuedAt: receipt.issued_at,
              referenceReceiptId: receipt.reference_receipt_id,
              refundAmount: receipt.refund_amount,
              returnPaymentType: receipt.return_payment_type,
            };

            await issueTenantReceipt(site, tenantReceipt);
            siteResult.receipts++;
          } catch (receiptError) {
            // Might already exist - not an error
            if (!(receiptError as Error).message.includes("already exists")) {
              siteResult.errors.push(`Receipt ${receipt.id}: ${(receiptError as Error).message}`);
            }
          }
        }

        console.log(`Site ${site}: ${siteResult.orders} orders, ${siteResult.receipts} receipts`);
      } catch (siteError) {
        siteResult.errors.push(`Site error: ${(siteError as Error).message}`);
      }

      results.push(siteResult);
    }

    const totalOrders = results.reduce((sum, r) => sum + r.orders, 0);
    const totalReceipts = results.reduce((sum, r) => sum + r.receipts, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    console.log(`Migration complete: ${totalOrders} orders, ${totalReceipts} receipts, ${totalErrors} errors`);

    return NextResponse.json({
      success: true,
      totalSites: sitesToMigrate.length,
      totalOrders,
      totalReceipts,
      totalErrors,
      results,
    });
  } catch (error) {
    console.error("Migration failed:", error);
    return NextResponse.json(
      {
        error: "Migration failed",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET - Check migration status
 */
export async function GET(request: NextRequest) {
  // Check admin secret
  const secret = request.headers.get("x-admin-secret");
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();

  try {
    // Get all sites
    const sites = await sql`
      SELECT DISTINCT site_id FROM companies WHERE site_id IS NOT NULL
    `;

    const status: Array<{
      siteId: string;
      tablesExist: boolean;
      legacyOrders: number;
      tenantOrders: number;
      legacyReceipts: number;
      tenantReceipts: number;
    }> = [];

    for (const row of sites.rows) {
      const site = row.site_id;
      const exists = await tenantTablesExist(site);

      // Count legacy orders
      const legacyOrders = await sql`
        SELECT COUNT(*) as count FROM orders WHERE site_id = ${site}
      `;

      // Count legacy receipts
      const legacyReceipts = await sql`
        SELECT COUNT(*) as count
        FROM receipts r
        LEFT JOIN orders o ON o.id = r.order_id
        WHERE o.site_id = ${site}
      `;

      let tenantOrderCount = 0;
      let tenantReceiptCount = 0;

      if (exists) {
        try {
          const { normalizeSiteId } = await import("@/lib/tenant-db");
          const n = normalizeSiteId(site);

          const tenantOrders = await sql.query(
            `SELECT COUNT(*) as count FROM orders_${n}`
          );
          tenantOrderCount = parseInt(tenantOrders.rows[0]?.count ?? '0', 10);

          const tenantReceipts = await sql.query(
            `SELECT COUNT(*) as count FROM receipts_${n}`
          );
          tenantReceiptCount = parseInt(tenantReceipts.rows[0]?.count ?? '0', 10);
        } catch {
          // Tables might not exist
        }
      }

      status.push({
        siteId: site,
        tablesExist: exists,
        legacyOrders: parseInt(legacyOrders.rows[0]?.count ?? '0', 10),
        tenantOrders: tenantOrderCount,
        legacyReceipts: parseInt(legacyReceipts.rows[0]?.count ?? '0', 10),
        tenantReceipts: tenantReceiptCount,
      });
    }

    return NextResponse.json({
      sites: status,
      totalSites: status.length,
      totalMigrated: status.filter((s) => s.tablesExist).length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
