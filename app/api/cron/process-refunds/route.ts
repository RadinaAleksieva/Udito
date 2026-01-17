import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import {
  getPendingRefunds,
  markRefundProcessed,
  markRefundFailed,
  normalizeSiteId,
  tenantTablesExist,
} from "@/lib/tenant-db";
import { issueRefundReceipt, getSaleReceiptByOrderId } from "@/lib/receipts";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60 seconds for processing

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If no secret configured, allow in development
    return process.env.NODE_ENV === "development";
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

/**
 * Process pending refunds from all tenant queues
 * This endpoint should be called by a cron job (e.g., every 5 minutes)
 *
 * Vercel Cron: Add to vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/process-refunds",
 *     "schedule": "* /5 * * * *"
 *   }]
 * }
 */
export async function GET(request: NextRequest) {
  // Verify authorization
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await initDb();

  const results = {
    processed: 0,
    failed: 0,
    skipped: 0,
    errors: [] as string[],
  };

  try {
    // Get all active sites (companies with store_id configured)
    const activeSites = await sql`
      SELECT DISTINCT site_id
      FROM companies
      WHERE site_id IS NOT NULL
        AND store_id IS NOT NULL
    `;

    console.log(`🔄 Processing refunds for ${activeSites.rows.length} sites`);

    for (const siteRow of activeSites.rows) {
      const siteId = siteRow.site_id;

      // Check if tenant tables exist
      const tablesExist = await tenantTablesExist(siteId);
      if (!tablesExist) {
        console.log(`⏭️ Skipping site ${siteId} - no tenant tables`);
        continue;
      }

      // Get pending refunds for this site
      const pendingRefunds = await getPendingRefunds(siteId, 10);

      if (pendingRefunds.length === 0) {
        continue;
      }

      console.log(`📋 Processing ${pendingRefunds.length} refunds for site ${siteId}`);

      for (const refund of pendingRefunds) {
        try {
          const { orderId, refundAmount, reason, eventPayload } = refund;

          // Check if we have an original sale receipt
          const originalReceipt = await getSaleReceiptByOrderId(orderId);

          if (!originalReceipt) {
            // No sale receipt yet - might need to wait
            if (refund.attempts < 2) {
              console.log(`⏳ Waiting for sale receipt for order ${orderId}`);
              await markRefundFailed(siteId, refund.id, "No sale receipt found - will retry");
              results.skipped++;
            } else {
              console.warn(`❌ No sale receipt found for order ${orderId} after ${refund.attempts} attempts`);
              await markRefundFailed(siteId, refund.id, "No sale receipt found - max retries reached");
              results.failed++;
            }
            continue;
          }

          // Issue the refund receipt
          const result = await issueRefundReceipt({
            orderId,
            payload: {
              ...eventPayload?.order,
              originalReceiptId: originalReceipt.id,
              refundReason: reason ?? "refunded",
            },
            businessId: null,
            issuedAt: eventPayload?.refundTimestamp ?? new Date().toISOString(),
            refundAmount: refundAmount ?? 0,
            siteId,
          });

          if (result.created) {
            await markRefundProcessed(siteId, refund.id);
            console.log(`✅ Refund receipt created for order ${orderId}, receipt ID: ${result.receiptId}`);
            results.processed++;
          } else {
            // Receipt already exists (duplicate)
            await markRefundProcessed(siteId, refund.id);
            console.log(`⏭️ Refund receipt already exists for order ${orderId}`);
            results.skipped++;
          }
        } catch (refundError) {
          const errorMsg = (refundError as Error).message;
          console.error(`❌ Error processing refund ${refund.id}:`, errorMsg);
          await markRefundFailed(siteId, refund.id, errorMsg);
          results.failed++;
          results.errors.push(`Refund ${refund.id}: ${errorMsg}`);
        }
      }
    }

    console.log(`📊 Refund processing complete:`, results);

    return NextResponse.json({
      ok: true,
      ...results,
    });
  } catch (error) {
    console.error("Error in cron process-refunds:", error);
    return NextResponse.json(
      {
        ok: false,
        error: (error as Error).message,
        ...results,
      },
      { status: 500 }
    );
  }
}

// Also allow POST for manual triggering (with auth)
export async function POST(request: NextRequest) {
  return GET(request);
}
