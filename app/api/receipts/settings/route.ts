import { NextResponse } from "next/server";
import { initDb, getReceiptSettings, updateReceiptSettings } from "@/lib/db";
import { getActiveStore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDb();
    const store = await getActiveStore();

    if (!store?.siteId && !store?.instanceId) {
      return NextResponse.json({ ok: false, error: "Missing site context" }, { status: 400 });
    }

    const settings = await getReceiptSettings(store.siteId, store.instanceId);
    return NextResponse.json({
      ok: true,
      settings: {
        receiptNumberStart: settings?.receipt_number_start ?? null,
        codReceiptsEnabled: settings?.cod_receipts_enabled ?? false,
      },
    });
  } catch (error) {
    console.error("Failed to load receipt settings", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await initDb();
    const store = await getActiveStore();

    if (!store?.siteId && !store?.instanceId) {
      return NextResponse.json({ ok: false, error: "Missing site context" }, { status: 400 });
    }

    const body = await request.json();
    const receiptNumberStart = body.receiptNumberStart != null
      ? Number(body.receiptNumberStart)
      : null;
    const codReceiptsEnabled = Boolean(body.codReceiptsEnabled);

    // Validate receipt number start (must be positive integer if provided)
    if (receiptNumberStart != null && (receiptNumberStart < 1 || !Number.isInteger(receiptNumberStart))) {
      return NextResponse.json(
        { ok: false, error: "Началният номер трябва да е цяло положително число" },
        { status: 400 }
      );
    }

    await updateReceiptSettings(store.siteId, { receiptNumberStart, codReceiptsEnabled }, store.instanceId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save receipt settings", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
