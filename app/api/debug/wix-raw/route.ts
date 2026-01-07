import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/wix";
import { getActiveWixContext } from "@/lib/wix-context";

const WIX_API_BASE = process.env.WIX_API_BASE || "https://www.wixapis.com";

/**
 * Debug endpoint to see raw Wix API response for orders query
 * This helps diagnose pagination issues
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
    const limit = Number(url.searchParams.get("limit") || 50);
    const cursor = url.searchParams.get("cursor") || null;
    const offset = url.searchParams.get("offset") || null;

    const accessToken = await getAccessToken({ siteId, instanceId });
    const authHeader = accessToken.startsWith("Bearer ")
      ? accessToken
      : `Bearer ${accessToken}`;

    // Build query with both cursor and offset options
    const query: any = {
      filter: {
        createdDate: { $gte: "2000-01-01T00:00:00Z" },
      },
      sort: [{ fieldName: "createdDate", order: "ASC" }], // ASC to get oldest first
      paging: {
        limit,
      },
    };

    if (cursor) {
      query.paging.cursor = cursor;
    } else if (offset) {
      query.paging.offset = Number(offset);
    }

    const response = await fetch(`${WIX_API_BASE}/ecom/v1/orders/query`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(siteId ? { "wix-site-id": siteId } : {}),
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({
        ok: false,
        error: `Wix API error: ${response.status}`,
        body: text,
      });
    }

    const data = await response.json();

    // Extract order numbers for easy viewing
    const orders = data.orders || data.results || data.items || [];
    const orderNumbers = orders.map((o: any) => ({
      id: o.id,
      number: o.number,
      createdDate: o.createdDate,
    }));

    return NextResponse.json({
      ok: true,
      totalReturned: orders.length,
      firstOrder: orderNumbers[0] || null,
      lastOrder: orderNumbers[orderNumbers.length - 1] || null,
      // Raw pagination info from response
      rawPaging: {
        metadata: data.metadata,
        paging: data.paging,
        pagingMetadata: data.pagingMetadata,
        cursor: data.cursor,
        nextCursor: data.nextCursor,
        hasNext: data.hasNext,
        total: data.total,
        totalCount: data.totalCount,
      },
      // All order numbers
      orderNumbers,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
