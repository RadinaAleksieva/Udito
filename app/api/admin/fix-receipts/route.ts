import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// DEPRECATED: This endpoint used legacy public.orders table which no longer exists.
// All orders are now in tenant-specific schemas.
// The original functionality was to fix/reset receipt data for thewhiterabbitshop.
// This is no longer needed as receipts are now managed per-tenant.

export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "DEPRECATED: This fix-receipts endpoint is no longer available.",
    message: "Orders and receipts are now stored in tenant-specific schemas. Use admin/seed-demo or direct tenant table operations instead."
  }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({
    ok: false,
    error: "DEPRECATED: This fix-receipts endpoint is no longer available.",
    message: "Orders and receipts are now stored in tenant-specific schemas."
  }, { status: 410 });
}
