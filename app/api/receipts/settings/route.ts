import { NextResponse } from "next/server";
import { initDb, getReceiptSettings, updateReceiptSettings } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";
import { auth, getUserStores } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function getIdentifiers() {
  let siteId: string | null = null;
  let instanceId: string | null = null;

  const session = await auth();
  if (session?.user?.id) {
    const userStores = await getUserStores(session.user.id);
    if (userStores.length > 0) {
      siteId = userStores[0].site_id || null;
      instanceId = userStores[0].instance_id || null;
    }
  } else {
    const token = await getActiveWixToken();
    siteId = token?.site_id ?? null;
    instanceId = token?.instance_id ?? null;
  }

  return { siteId, instanceId };
}

export async function GET() {
  try {
    await initDb();
    const { siteId, instanceId } = await getIdentifiers();

    if (!siteId && !instanceId) {
      return NextResponse.json({ ok: false, error: "Missing site context" }, { status: 400 });
    }

    const settings = await getReceiptSettings(siteId, instanceId);
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
    const { siteId, instanceId } = await getIdentifiers();

    if (!siteId && !instanceId) {
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

    await updateReceiptSettings(siteId, { receiptNumberStart, codReceiptsEnabled }, instanceId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to save receipt settings", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
