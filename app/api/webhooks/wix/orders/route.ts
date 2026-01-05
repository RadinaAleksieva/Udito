import { NextRequest, NextResponse } from "next/server";
import { initDb, upsertOrder } from "@/lib/db";
import { pickOrderFields } from "@/lib/wix";

export async function POST(request: NextRequest) {
  const rawBody = await request.text().catch(() => "");
  let payload: unknown = null;
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody);
    } catch (error) {
      console.warn("Wix webhook JSON parse failed", { error, rawBody });
    }
  }

  // TODO: Verify Wix webhook signature. For now we store the raw payload.
  if (payload && typeof payload === "object") {
    const raw = payload as any;
    const orderId =
      raw?.data?.orderId || raw?.orderId || raw?.data?.order?.id;
    const mapped = pickOrderFields(
      { ...raw?.data?.order, id: orderId, paymentStatus: raw?.data?.paymentStatus },
      "webhook"
    );
    if (mapped.id) {
      await initDb();
      await upsertOrder(mapped);
    }
  }

  console.log("Wix order webhook received", payload ?? { empty: true });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
