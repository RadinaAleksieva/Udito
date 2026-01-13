import { NextResponse } from "next/server";
import { initDb, listAllDetailedOrdersForSite } from "@/lib/db";
import { getActiveWixContext } from "@/lib/wix-context";
import {
  queryOrders,
  extractTransactionRef,
  fetchOrderTransactionsForOrder,
  extractTransactionRefFromPayment,
} from "@/lib/wix";

export async function GET() {
  try {
    await initDb();
    const { siteId, instanceId } = await getActiveWixContext();
    if (!siteId) {
      return NextResponse.json(
        { ok: false, error: "Missing site context." },
        { status: 400 }
      );
    }

    // Get all orders from UDITO database
    const dbOrders = await listAllDetailedOrdersForSite(siteId);
    const dbOrderMap = new Map<string, any>();
    for (const order of dbOrders) {
      dbOrderMap.set(order.id, order);
    }

    // Get all orders from Wix (paginate through all)
    const wixOrders: any[] = [];
    let cursor: string | null = null;
    let pages = 0;
    const maxPages = 100; // Safety limit

    do {
      const page = await queryOrders({
        startDateIso: "2000-01-01T00:00:00Z",
        cursor,
        limit: 100,
        siteId,
        instanceId,
      });
      wixOrders.push(...(page.orders || []));
      cursor = page.cursor ?? null;
      pages++;
    } while (cursor && pages < maxPages);

    // Compare orders
    const comparison: {
      orderId: string;
      orderNumber: string | null;
      inWix: boolean;
      inUdito: boolean;
      wixTransactionRef: string | null;
      uditoTransactionRef: string | null;
      match: boolean;
      paymentStatus: string | null;
    }[] = [];

    const allOrderIds = new Set([
      ...wixOrders.map((o: any) => o.id || o._id),
      ...dbOrders.map((o) => o.id),
    ]);

    for (const orderId of allOrderIds) {
      const wixOrder = wixOrders.find(
        (o: any) => (o.id || o._id) === orderId
      );
      const dbOrder = dbOrderMap.get(orderId);

      const wixTxRef = wixOrder ? extractTransactionRef(wixOrder) : null;
      const uditoTxRef = dbOrder?.raw
        ? extractTransactionRef(dbOrder.raw)
        : null;

      const paymentStatus =
        wixOrder?.paymentStatus || dbOrder?.payment_status || null;

      comparison.push({
        orderId,
        orderNumber:
          wixOrder?.number ||
          wixOrder?.orderNumber?.number ||
          dbOrder?.number ||
          null,
        inWix: Boolean(wixOrder),
        inUdito: Boolean(dbOrder),
        wixTransactionRef: wixTxRef,
        uditoTransactionRef: uditoTxRef,
        match: wixTxRef === uditoTxRef || (!wixTxRef && !uditoTxRef),
        paymentStatus,
      });
    }

    // Sort by order number descending
    comparison.sort((a, b) => {
      const numA = parseInt(a.orderNumber || "0", 10);
      const numB = parseInt(b.orderNumber || "0", 10);
      return numB - numA;
    });

    // Summary stats
    const stats = {
      totalWix: wixOrders.length,
      totalUdito: dbOrders.length,
      onlyInWix: comparison.filter((c) => c.inWix && !c.inUdito).length,
      onlyInUdito: comparison.filter((c) => !c.inWix && c.inUdito).length,
      inBoth: comparison.filter((c) => c.inWix && c.inUdito).length,
      transactionMismatch: comparison.filter(
        (c) => c.inWix && c.inUdito && !c.match
      ).length,
      paidWithoutTxRef: comparison.filter(
        (c) =>
          c.paymentStatus?.toUpperCase() === "PAID" &&
          !c.uditoTransactionRef &&
          c.inUdito
      ).length,
    };

    // Find mismatches for detailed report
    const mismatches = comparison.filter(
      (c) =>
        !c.inUdito ||
        (c.inWix && c.inUdito && !c.match) ||
        (c.paymentStatus?.toUpperCase() === "PAID" && !c.uditoTransactionRef)
    );

    return NextResponse.json({
      ok: true,
      stats,
      mismatches,
      allOrders: comparison,
    });
  } catch (error) {
    console.error("Compare failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
