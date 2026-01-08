import { NextResponse } from "next/server";
import {
  buildAuditXml,
  determinePaymentType,
  type AuditOrder,
  type AuditLineItem,
} from "@/lib/auditXml";
import { getCompanyBySite, initDb, getOrderByIdForSite } from "@/lib/db";
import { listOrdersWithReceiptsForAudit } from "@/lib/receipts";
import { getActiveWixToken } from "@/lib/wix-context";
import { extractTransactionRef } from "@/lib/wix";

export const dynamic = "force-dynamic";

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Extract line items from raw order data
 */
function extractLineItems(raw: any): AuditLineItem[] {
  const items =
    raw?.lineItems?.items ??
    raw?.lineItems ??
    raw?.items ??
    raw?.line_items ??
    [];

  if (!Array.isArray(items)) return [];

  return items.map((item: any) => {
    // Get item name
    const nameObj = item?.name ?? item?.productName ?? item?.description ?? "Артикул";
    const name = typeof nameObj === "string"
      ? nameObj
      : nameObj?.translated ?? nameObj?.original ?? nameObj?.value ?? "Артикул";

    // Get quantity
    const quantity = Number(item?.quantity ?? item?.amount ?? 1) || 1;

    // Get price with VAT (единична цена)
    const unitPrice = Number(
      item?.price?.amount ??
      item?.price?.value ??
      item?.price ??
      item?.totalPrice?.amount ??
      0
    ) || 0;

    // If we have lineTotal, calculate unit price from it
    const lineTotal = Number(
      item?.totalPrice?.amount ??
      item?.total ??
      item?.lineTotal ??
      0
    ) || 0;

    const priceWithVat = lineTotal > 0 && quantity > 0
      ? lineTotal / quantity
      : unitPrice;

    // VAT rate (default 20% for Bulgaria)
    const vatRate = Number(item?.taxPercent ?? item?.taxRate ?? 20) || 20;

    return {
      name: String(name).substring(0, 200),
      quantity,
      priceWithVat,
      vatRate,
    };
  });
}

/**
 * Extract payment method from raw order data
 */
function extractPaymentMethod(raw: any): string {
  const summary = raw?.udito?.paymentSummary ?? null;

  return String(
    summary?.methodLabel ??
    raw?.paymentMethod?.paymentMethodType ??
    raw?.paymentMethod?.methodType ??
    raw?.paymentMethod?.type ??
    raw?.paymentMethod?.name ??
    raw?.payment?.method ??
    ""
  );
}

/**
 * Extract processor ID (Stripe account ID) from raw order data
 */
function extractProcessorId(raw: any): string | undefined {
  // Look for Stripe account ID in various places
  const stripeAccount =
    raw?.udito?.stripeAccountId ??
    raw?.payment?.stripeAccountId ??
    raw?.paymentMethod?.stripeAccountId ??
    raw?.paymentInfo?.stripeAccountId ??
    null;

  if (stripeAccount) return stripeAccount;

  // Try to extract from transaction ref if it's a Stripe format
  const transRef = extractTransactionRef(raw);
  if (transRef?.startsWith("pi_")) {
    // For Stripe, we might have processor info in payment
    const paymentProc =
      raw?.payment?.processorId ??
      raw?.payment?.accountId ??
      raw?.paymentInfo?.processorId ??
      null;
    if (paymentProc) return paymentProc;
  }

  return undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get("month");

  // Parse month parameter (YYYY-MM format)
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json(
      { ok: false, error: "Моля, посочете месец във формат YYYY-MM (напр. 2025-11)" },
      { status: 400 }
    );
  }

  const [yearStr, monthStr] = monthParam.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  // Validate it's a past month
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const requestedMonthStart = new Date(year, monthIndex, 1);

  if (requestedMonthStart >= currentMonthStart) {
    return NextResponse.json(
      { ok: false, error: "Одиторският файл е наличен само за приключени месеци." },
      { status: 400 }
    );
  }

  // Calculate date range for the month
  const startDate = new Date(year, monthIndex, 1);
  const endDate = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  await initDb();
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;

  if (!siteId) {
    return NextResponse.json(
      { ok: false, error: "Липсва връзка с магазин. Отворете приложението от Wix." },
      { status: 400 }
    );
  }

  const company = await getCompanyBySite(siteId);

  if (!company?.bulstat) {
    return NextResponse.json(
      { ok: false, error: "Липсва ЕИК на фирмата. Попълнете го в Настройки." },
      { status: 400 }
    );
  }

  if (!company?.fiscal_store_id) {
    return NextResponse.json(
      { ok: false, error: "Липсва уникален код на магазина (в НАП). Попълнете го в Настройки." },
      { status: 400 }
    );
  }

  // Get orders with receipts for the period
  const rows = await listOrdersWithReceiptsForAudit(startIso, endIso, siteId);

  // Build audit orders
  const auditOrders: AuditOrder[] = [];

  for (const row of rows) {
    // Get full order details
    const fullOrder = await getOrderByIdForSite(row.id, siteId);
    const raw = (fullOrder?.raw ?? row.raw ?? {}) as any;

    // Extract line items
    const items = extractLineItems(raw);

    // Skip orders with no items
    if (items.length === 0) {
      // Add a fallback item for the total
      items.push({
        name: "Поръчка",
        quantity: 1,
        priceWithVat: Number(row.total) || 0,
        vatRate: 20,
      });
    }

    // Discount is always 0 - item prices already include any discounts applied
    const discount = 0;

    // Get payment type
    const paymentMethod = extractPaymentMethod(raw);
    const paymentType = determinePaymentType(paymentMethod);

    // Get transaction ref
    const transactionRef = extractTransactionRef(raw) || undefined;

    // Get processor ID
    const processorId = extractProcessorId(raw);

    // Format dates
    const paidAt = row.paid_at ? new Date(row.paid_at) : new Date(row.created_at);
    const receiptIssuedAt = row.receipt_issued_at
      ? new Date(row.receipt_issued_at)
      : paidAt;

    auditOrders.push({
      orderNumber: String(row.number || row.id).padStart(10, "0"),
      orderDate: formatDate(paidAt),
      receiptNumber: String(row.receipt_id).padStart(10, "0"),
      receiptDate: formatDate(receiptIssuedAt),
      items,
      discount,
      paymentType,
      transactionRef,
      processorId,
    });
  }

  // Build the XML
  const xml = buildAuditXml({
    eik: company.bulstat,
    shopNumber: company.fiscal_store_id,
    domainName: company.store_domain || "unknown",
    shopType: 1,
    creationDate: formatDate(new Date()),
    month: monthStr,
    year,
    orders: auditOrders,
    returns: [], // TODO: Handle returns when implemented
  });

  // Create filename
  const filename = `NRA-${year}-${monthStr}-AuditFile.xml`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=windows-1251",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
