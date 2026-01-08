import { NextResponse } from "next/server";
import { buildAuditXml } from "@/lib/auditXml";
import { getCompanyBySite, initDb } from "@/lib/db";
import { listOrdersWithReceiptsForAudit } from "@/lib/receipts";
import { getActiveWixToken } from "@/lib/wix-context";

function resolveMonthRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  const monthParam = searchParams.get("month");

  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, month] = monthParam.split("-").map(Number);
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0, 23, 59, 59);
  } else if (startParam && endParam) {
    const parsedStart = new Date(startParam);
    const parsedEnd = new Date(endParam);
    if (!Number.isNaN(parsedStart.valueOf()) && !Number.isNaN(parsedEnd.valueOf())) {
      startDate = parsedStart;
      endDate = parsedEnd;
    }
  }

  if (!startDate || !endDate) {
    const range = resolveMonthRange();
    startDate = range.start;
    endDate = range.end;
  }

  const currentMonthStart = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  );
  if (startDate >= currentMonthStart) {
    return NextResponse.json(
      { ok: false, error: "Audit file is available only for past months." },
      { status: 400 }
    );
  }

  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  await initDb();
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;
  const company = siteId ? await getCompanyBySite(siteId) : null;

  // IMPORTANT: Audit file ONLY includes orders that have receipts issued
  // and filters by paid_at date (when payment was received), not created_at
  const rows = siteId
    ? await listOrdersWithReceiptsForAudit(startIso, endIso, siteId)
    : [];

  const orders = rows
    .filter((row) => row?.id && row?.total != null && row?.currency)
    .map((row) => ({
      id: String(row.id),
      number: row.number ? String(row.number) : String(row.id),
      // Use paid_at as the primary date for audit (when payment was received)
      createdAt: row.paid_at
        ? new Date(row.paid_at).toISOString()
        : row.created_at
          ? new Date(row.created_at).toISOString()
          : startIso,
      paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : undefined,
      receiptId: row.receipt_id ? String(row.receipt_id) : undefined,
      totalAmount: Number(row.total) || 0,
      currency: String(row.currency),
      customerName: row.customer_name ? String(row.customer_name) : undefined,
      customerEmail: row.customer_email ? String(row.customer_email) : undefined,
    }));

  const xml = buildAuditXml({
    merchantId: company?.bulstat || process.env.MERCHANT_ID || "BG207357583",
    merchantName:
      company?.legal_name || process.env.MERCHANT_NAME || "DESIGNS BY PO Ltd.",
    vatNumber: company?.vat_number || process.env.MERCHANT_VAT || "BG207357583",
    periodStart: startIso.slice(0, 10),
    periodEnd: endIso.slice(0, 10),
    orders,
  });

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename=udito-audit-${startIso.slice(0, 10)}.xml`,
    },
  });
}
