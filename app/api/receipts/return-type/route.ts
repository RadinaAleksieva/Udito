import { NextResponse } from "next/server";
import { initDb, updateReturnPaymentType, getReceiptById } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

/**
 * Update return payment type for a refund receipt
 * POST /api/receipts/return-type
 * Body: { receiptId: number, returnPaymentType: number }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { receiptId, returnPaymentType } = body;

    // Validate inputs
    if (!receiptId || typeof receiptId !== "number") {
      return NextResponse.json(
        { ok: false, error: "Липсва ID на бележката" },
        { status: 400 }
      );
    }

    if (!returnPaymentType || ![1, 2, 3, 4].includes(returnPaymentType)) {
      return NextResponse.json(
        { ok: false, error: "Невалиден тип на връщане (1-4)" },
        { status: 400 }
      );
    }

    await initDb();
    const token = await getActiveWixToken();

    if (!token?.site_id) {
      return NextResponse.json(
        { ok: false, error: "Не сте влезли в системата" },
        { status: 401 }
      );
    }

    // Get the receipt to verify it exists and is a refund
    const receipt = await getReceiptById(receiptId);

    if (!receipt) {
      return NextResponse.json(
        { ok: false, error: "Бележката не е намерена" },
        { status: 404 }
      );
    }

    if (receipt.type !== "refund") {
      return NextResponse.json(
        { ok: false, error: "Само сторно бележки могат да имат начин на връщане" },
        { status: 400 }
      );
    }

    // Update the return payment type
    await updateReturnPaymentType(receiptId, returnPaymentType);

    return NextResponse.json({
      ok: true,
      message: "Начинът на връщане е обновен успешно",
      returnPaymentType,
    });
  } catch (error) {
    console.error("Error updating return payment type:", error);
    return NextResponse.json(
      { ok: false, error: "Грешка при обновяване" },
      { status: 500 }
    );
  }
}
