import { NextResponse } from "next/server";
import { queryOrders } from "@/lib/wix";
import { getActiveWixContext } from "@/lib/wix-context";

/**
 * Debug endpoint to test queryOrders cursor extraction
 */
export async function GET(request: Request) {
  try {
    const { siteId, instanceId } = getActiveWixContext();

    if (!siteId && !instanceId) {
      return NextResponse.json(
        { ok: false, error: "Missing Wix context." },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 10);
    const cursor = url.searchParams.get("cursor") || null;

    // Call queryOrders and see what it returns
    const result = await queryOrders({
      startDateIso: "2000-01-01T00:00:00Z",
      cursor,
      limit,
      siteId,
      instanceId,
      paymentStatus: null,
    });

    return NextResponse.json({
      ok: true,
      ordersCount: result.orders.length,
      cursor: result.cursor,
      cursorType: typeof result.cursor,
      firstOrderNumber: (result.orders[0] as any)?.number ?? null,
      lastOrderNumber: (result.orders[result.orders.length - 1] as any)?.number ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
