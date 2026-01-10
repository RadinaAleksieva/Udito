import { NextResponse } from "next/server";
import { initDb, listAllDetailedOrdersForSite, listAllDetailedOrders } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDb();

    const siteId = "6240f8a5-7af4-4fdf-96c1-d1f22b205408";

    // Test with specific siteId
    const ordersForSite = await listAllDetailedOrdersForSite(siteId);

    // Test with all orders
    const allOrders = await listAllDetailedOrders();

    return NextResponse.json({
      siteId,
      ordersForSiteCount: ordersForSite.length,
      ordersForSiteNumbers: ordersForSite.map((o: any) => o.number).slice(0, 20),
      allOrdersCount: allOrders.length,
      allOrdersNumbers: allOrders.map((o: any) => o.number).slice(0, 20),
      hasOrder10232InSite: ordersForSite.some((o: any) => o.number === "10232"),
      hasOrder10232InAll: allOrders.some((o: any) => o.number === "10232"),
    });
  } catch (error) {
    console.error("Debug function test failed", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
