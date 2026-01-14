import { NextResponse } from "next/server";
import {
  initDb,
  getReceiptWithSiteById,
  deleteReceiptById,
  deleteRefundReceiptsByReference,
} from "@/lib/db";
import { getActiveStore } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Cancel/void a receipt by deleting it from the database
 * POST /api/receipts/cancel
 * Body: { receiptId: number }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { receiptId } = body;

    if (!receiptId || typeof receiptId !== "number") {
      return NextResponse.json(
        { ok: false, error: "Липсва ID на бележката" },
        { status: 400 }
      );
    }

    await initDb();
    const store = await getActiveStore();

    if (!store?.siteId && !store?.instanceId) {
      return NextResponse.json(
        { ok: false, error: "Не сте влезли в системата" },
        { status: 401 }
      );
    }

    // First check if the receipt exists and get its details
    const receipt = await getReceiptWithSiteById(receiptId);

    if (!receipt) {
      return NextResponse.json(
        { ok: false, error: "Бележката не е намерена" },
        { status: 404 }
      );
    }

    // Verify the receipt belongs to the current store
    const storeId = store.siteId || store.instanceId;
    if (receipt.site_id && receipt.site_id !== storeId && receipt.site_id !== store.instanceId) {
      return NextResponse.json(
        { ok: false, error: "Нямате права да анулирате тази бележка" },
        { status: 403 }
      );
    }

    // If this is a sale receipt, also delete any refund receipts that reference it
    if (receipt.type === "sale") {
      await deleteRefundReceiptsByReference(receiptId);
    }

    // Delete the receipt
    await deleteReceiptById(receiptId);

    return NextResponse.json({
      ok: true,
      message: "Бележката е анулирана успешно",
      deletedReceiptId: receiptId,
      receiptType: receipt.type,
    });
  } catch (error) {
    console.error("Error canceling receipt:", error);
    return NextResponse.json(
      { ok: false, error: "Грешка при анулиране на бележката" },
      { status: 500 }
    );
  }
}
