import { NextResponse } from "next/server";
import { initDb, listPaginatedOrdersForSite } from "@/lib/db";
import { getActiveWixContext } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initDb();
    const { siteId } = getActiveWixContext();

    if (!siteId) {
      return NextResponse.json({ ok: false, error: "Missing site context" }, { status: 400 });
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 20), 100);
    const offset = Number(url.searchParams.get("offset") || 0);
    const month = url.searchParams.get("month") || null;

    let rangeStart: string | null = null;
    let rangeEnd: string | null = null;

    if (month) {
      const monthMatch = month.match(/^(\d{4})-(\d{2})$/);
      if (monthMatch) {
        const year = Number(monthMatch[1]);
        const monthIndex = Number(monthMatch[2]) - 1;
        rangeStart = new Date(year, monthIndex, 1, 0, 0, 0).toISOString();
        rangeEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).toISOString();
      }
    }

    const { orders, total } = await listPaginatedOrdersForSite(
      siteId,
      limit,
      offset,
      rangeStart,
      rangeEnd
    );

    return NextResponse.json({
      ok: true,
      orders,
      total,
      offset,
      limit,
      hasMore: offset + orders.length < total,
    });
  } catch (error) {
    console.error("Orders list failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
