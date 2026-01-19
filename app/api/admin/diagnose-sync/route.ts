import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { getActiveStore } from "@/lib/auth";
import { queryOrders } from "@/lib/wix";
import { getSchemaForSite, getTenantSyncState, countTenantOrders } from "@/lib/tenant-db";
import { sql } from "@/lib/sql";

export const dynamic = "force-dynamic";

/**
 * Diagnostic API to compare Wix orders with database orders
 * Helps identify sync issues and missing orders
 */
export async function GET(request: NextRequest) {
  try {
    await initDb();

    const url = new URL(request.url);
    const storeParam = url.searchParams.get("store");
    const store = await getActiveStore(storeParam);
    const siteId = store?.siteId ?? null;
    const instanceId = store?.instanceId ?? null;

    if (!siteId && !instanceId) {
      return NextResponse.json({ error: "No store context" }, { status: 400 });
    }

    // Get database counts
    const schema = await getSchemaForSite(siteId!);
    if (!schema) {
      return NextResponse.json({ error: "No schema found" }, { status: 400 });
    }

    // Count all orders in DB (no filters)
    const dbTotalResult = await sql.query(`
      SELECT COUNT(*) as total FROM "${schema}".orders
    `);
    const dbTotal = parseInt(dbTotalResult.rows[0]?.total ?? '0', 10);

    // Count orders excluding archived/canceled
    const dbActiveResult = await sql.query(`
      SELECT COUNT(*) as total FROM "${schema}".orders
      WHERE (status IS NULL OR LOWER(status) NOT LIKE 'archiv%')
        AND (status IS NULL OR UPPER(status) NOT IN ('CANCELED', 'CANCELLED'))
        AND COALESCE(raw->>'archived', 'false') <> 'true'
        AND COALESCE(raw->>'isArchived', 'false') <> 'true'
    `);
    const dbActive = parseInt(dbActiveResult.rows[0]?.total ?? '0', 10);

    // Count archived/canceled
    const dbArchivedResult = await sql.query(`
      SELECT COUNT(*) as total FROM "${schema}".orders
      WHERE LOWER(status) LIKE 'archiv%'
         OR UPPER(status) IN ('CANCELED', 'CANCELLED')
         OR COALESCE(raw->>'archived', 'false') = 'true'
         OR COALESCE(raw->>'isArchived', 'false') = 'true'
    `);
    const dbArchived = parseInt(dbArchivedResult.rows[0]?.total ?? '0', 10);

    // Count orders with null totals
    const dbNullTotalsResult = await sql.query(`
      SELECT COUNT(*) as total FROM "${schema}".orders
      WHERE total IS NULL OR total = 0
    `);
    const dbNullTotals = parseInt(dbNullTotalsResult.rows[0]?.total ?? '0', 10);

    // Get min/max order numbers in DB
    const dbRangeResult = await sql.query(`
      SELECT
        MIN(CAST(number AS INTEGER)) as min_number,
        MAX(CAST(number AS INTEGER)) as max_number,
        MIN(created_at) as earliest_order,
        MAX(created_at) as latest_order
      FROM "${schema}".orders
      WHERE number ~ '^[0-9]+$'
    `);
    const dbMinNumber = dbRangeResult.rows[0]?.min_number;
    const dbMaxNumber = dbRangeResult.rows[0]?.max_number;
    const dbEarliestOrder = dbRangeResult.rows[0]?.earliest_order;
    const dbLatestOrder = dbRangeResult.rows[0]?.latest_order;

    // Get sync state
    const syncState = await getTenantSyncState(siteId!);

    // Query Wix to get total order count
    let wixTotal: number | null = null;
    let wixError: string | null = null;
    let wixSampleOrders: any[] = [];

    try {
      const wixPage = await queryOrders({
        startDateIso: "2000-01-01T00:00:00Z",
        limit: 5,
        siteId,
        instanceId,
        paymentStatus: null, // All orders, not just PAID
      });
      wixTotal = wixPage.total;
      wixSampleOrders = (wixPage.orders || []).map((o: any) => ({
        number: o.number,
        status: o.status,
        paymentStatus: o.paymentStatus,
        createdDate: o.createdDate,
        total: o.priceSummary?.total?.amount ?? o.totals?.total?.amount ?? null,
        archived: o.archived ?? o.isArchived ?? false,
      }));
    } catch (e) {
      wixError = (e as Error).message;
    }

    // Find gaps in order numbers
    const gapsResult = await sql.query(`
      WITH numbered AS (
        SELECT CAST(number AS INTEGER) as num
        FROM "${schema}".orders
        WHERE number ~ '^[0-9]+$'
      ),
      expected AS (
        SELECT generate_series(
          (SELECT MIN(num) FROM numbered),
          (SELECT MAX(num) FROM numbered)
        ) as expected_num
      )
      SELECT expected_num
      FROM expected
      WHERE expected_num NOT IN (SELECT num FROM numbered)
      ORDER BY expected_num
      LIMIT 50
    `);
    const missingNumbers = gapsResult.rows.map((r: any) => r.expected_num);

    // Get sample of orders with issues
    const issuesResult = await sql.query(`
      SELECT number, status, payment_status, total, currency, created_at,
             raw->>'archived' as archived,
             raw->>'isArchived' as is_archived
      FROM "${schema}".orders
      WHERE total IS NULL OR total = 0
         OR LOWER(status) LIKE 'archiv%'
         OR UPPER(status) IN ('CANCELED', 'CANCELLED')
      ORDER BY created_at DESC
      LIMIT 10
    `);

    return NextResponse.json({
      database: {
        schema,
        total: dbTotal,
        active: dbActive,
        archived: dbArchived,
        nullTotals: dbNullTotals,
        minNumber: dbMinNumber,
        maxNumber: dbMaxNumber,
        earliestOrder: dbEarliestOrder,
        latestOrder: dbLatestOrder,
        expectedRange: dbMaxNumber && dbMinNumber
          ? `${dbMinNumber} - ${dbMaxNumber} (${dbMaxNumber - dbMinNumber + 1} expected)`
          : null,
        missingGap: dbMaxNumber && dbMinNumber
          ? (dbMaxNumber - dbMinNumber + 1) - dbTotal
          : null,
      },
      wix: {
        total: wixTotal,
        error: wixError,
        sampleOrders: wixSampleOrders,
      },
      syncState: syncState ? {
        status: syncState.status,
        cursor: syncState.cursor,
        lastError: syncState.last_error,
        updatedAt: syncState.updated_at,
      } : null,
      analysis: {
        missingOrders: wixTotal != null ? wixTotal - dbTotal : null,
        missingNumbers: missingNumbers.slice(0, 20),
        missingNumbersCount: missingNumbers.length,
        issueOrders: issuesResult.rows,
      },
    });
  } catch (error) {
    console.error("Diagnose sync error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
