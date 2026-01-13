import { NextResponse } from "next/server";
import { initDb, listRecentOrdersForSite, getOrderByIdForSite } from "@/lib/db";
import { getActiveWixContext } from "@/lib/wix-context";
import { fetchOrderDetails, getAccessToken } from "@/lib/wix";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await initDb();
  const { siteId, instanceId } = await getActiveWixContext();
  if (!siteId) {
    return NextResponse.json(
      { ok: false, error: "Missing site context." },
      { status: 400 }
    );
  }
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (orderId) {
    const order = await getOrderByIdForSite(orderId, siteId);
    const enriched = await fetchOrderDetails({ orderId, siteId });
    const accessToken = await getAccessToken({ siteId, instanceId });
    const authHeader = accessToken.startsWith("Bearer ")
      ? accessToken
      : `Bearer ${accessToken}`;
    let invoices: unknown = null;
    let invoicesError: string | null = null;
    try {
      const response = await fetch("https://www.wixapis.com/ecom/v1/invoices/list-by-ids", {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          ...(siteId ? { "wix-site-id": siteId } : {}),
        },
        body: JSON.stringify({ orderIds: [orderId] }),
      });
      const bodyText = await response.text();
      invoices = { status: response.status, body: bodyText };
    } catch (error) {
      invoicesError = (error as Error).message;
    }
    return NextResponse.json({
      ok: true,
      siteId,
      order,
      enriched,
      invoices,
      invoicesError,
    });
  }
  const rows = await listRecentOrdersForSite(siteId, 1);
  return NextResponse.json({ ok: true, siteId, order: rows?.[0] ?? null });
}
