import { NextResponse } from "next/server";
import {
  initDb,
  getReceiptWithSiteById,
  deleteReceiptById,
  deleteRefundReceiptsByReference,
} from "@/lib/db";
import { auth, getActiveStore } from "@/lib/auth";
import { deleteTenantReceipt, logAuditEvent } from "@/lib/tenant-db";

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
    // Receipt site_id MUST match either store.siteId OR store.instanceId
    // SECURITY: If receipt has no site_id, deny deletion (prevents unauthorized access to orphan records)
    const receiptSiteId = receipt.site_id;

    if (!receiptSiteId) {
      // Receipt has no associated site_id - cannot verify ownership
      // This could be orphan data or a data integrity issue
      console.warn(`Receipt ${receiptId} has no site_id - denying deletion for security`);
      return NextResponse.json(
        { ok: false, error: "Бележката не може да бъде анулирана - липсва идентификатор на магазина" },
        { status: 403 }
      );
    }

    const isOwner = receiptSiteId === store.siteId || receiptSiteId === store.instanceId;
    if (!isOwner) {
      return NextResponse.json(
        { ok: false, error: "Нямате права да анулирате тази бележка" },
        { status: 403 }
      );
    }

    // If this is a sale receipt, also delete any refund receipts that reference it
    if (receipt.type === "sale") {
      await deleteRefundReceiptsByReference(receiptId);
    }

    // Delete the receipt from legacy table
    await deleteReceiptById(receiptId);

    // Also delete from tenant-specific table if it exists
    try {
      await deleteTenantReceipt(receiptSiteId, receiptId);
    } catch (tenantError) {
      // Tenant table might not exist yet - ignore
      console.warn("Could not delete from tenant table:", tenantError);
    }

    // Log audit event
    const session = await auth();
    try {
      await logAuditEvent(receiptSiteId, {
        action: 'receipt.cancelled',
        userId: session?.user?.id ?? null,
        orderId: receipt.order_id ?? null,
        receiptId: receiptId,
        details: {
          receiptType: receipt.type,
          orderNumber: receipt.order_number,
        },
      });
    } catch (auditError) {
      console.warn("Could not log audit event:", auditError);
    }

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
