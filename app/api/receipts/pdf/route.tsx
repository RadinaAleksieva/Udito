import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { initDb, getCompanyBySite, getOrderByIdForSite } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";
import { getReceiptByOrderIdAndType } from "@/lib/receipts";
import { extractTransactionRef } from "@/lib/wix";
import { ReceiptPdf, ReceiptPdfData } from "@/lib/receipt-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Official EUR/BGN conversion rate
const BGN_TO_EUR = 0.51129;

function shouldShowEurPrimary(issuedAt: string | null): boolean {
  if (!issuedAt) return false;
  const date = new Date(issuedAt);
  return date >= new Date("2026-01-01T00:00:00.000Z");
}

function convertToEur(amount: number): number {
  return amount * BGN_TO_EUR;
}

function normalizeText(value: any, fallback = "—"): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const translated = value.translated ?? value.translation ?? null;
    if (typeof translated === "string") return translated;
    const original = value.original ?? value.value ?? null;
    if (typeof original === "string") return original;
  }
  return fallback;
}

function extractCustomerName(record: any, raw: any): string {
  if (record?.customer_name) return record.customer_name;
  const buyer = raw?.buyerInfo ?? raw?.buyer ?? raw?.customerInfo ?? raw?.customer ?? {};
  const billing = raw?.billingInfo?.contactDetails ?? raw?.billingInfo?.address ?? raw?.billingInfo ?? {};
  const recipient = raw?.recipientInfo?.contactDetails ?? raw?.recipientInfo ?? raw?.shippingInfo?.shipmentDetails?.address ?? {};
  const first = buyer?.firstName ?? buyer?.givenName ?? billing?.firstName ?? recipient?.firstName ?? "";
  const last = buyer?.lastName ?? buyer?.familyName ?? billing?.lastName ?? recipient?.lastName ?? "";
  const full = `${first} ${last}`.trim();
  return full || "Липсва";
}

function extractCustomerEmail(record: any, raw: any): string {
  return (
    record?.customer_email ??
    raw?.buyerInfo?.email ??
    raw?.buyer?.email ??
    raw?.customerInfo?.email ??
    raw?.billingInfo?.contactDetails?.email ??
    "Липсва"
  );
}

function extractPhone(raw: any): string {
  return (
    raw?.buyerInfo?.phone ||
    raw?.buyer?.phone ||
    raw?.billingInfo?.phone ||
    raw?.billingInfo?.contactDetails?.phone ||
    raw?.shippingInfo?.phone ||
    raw?.shippingInfo?.shipmentDetails?.phone ||
    ""
  );
}

function extractShipping(raw: any) {
  return (
    raw?.shippingInfo?.logistics?.shippingDestination?.address ??
    raw?.shippingInfo?.shipmentDetails?.address ??
    raw?.recipientInfo?.address ??
    raw?.shippingInfo?.shippingAddress ??
    raw?.billingInfo?.address ??
    null
  );
}

function resolveShippingLines(shipping: any) {
  if (!shipping) {
    return { line1: "Липсва", line2: "", city: "", postalCode: "", country: "" };
  }
  return {
    line1: shipping.addressLine ?? shipping.addressLine1 ?? shipping.streetAddress ?? "Липсва",
    line2: shipping.addressLine2 ?? shipping.line2 ?? "",
    city: shipping.city ?? shipping.town ?? "",
    postalCode: shipping.postalCode ?? shipping.zipCode ?? "",
    country: shipping.countryFullname ?? shipping.country ?? "",
  };
}

function extractShippingMethod(raw: any): string {
  const candidate =
    raw?.udito?.deliveryMethod ??
    raw?.shippingInfo?.title ??
    raw?.shippingInfo?.shipmentDetails?.methodName ??
    raw?.shippingInfo?.shippingMethodName ??
    null;
  return normalizeText(candidate, "Липсва");
}

function extractLineItems(raw: any) {
  const items = raw?.lineItems?.items ?? raw?.lineItems ?? raw?.items ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => {
    const priceAfterDiscount = Number(
      item?.totalPriceAfterTax?.amount ?? item?.price?.amount ?? item?.price ?? 0
    );
    const quantity = Number(item?.quantity ?? 1);
    const taxPercent = item?.taxPercent ?? item?.taxRate ?? 20;
    const netUnit = priceAfterDiscount / (1 + taxPercent / 100) / quantity;
    return {
      name: normalizeText(item?.name ?? item?.productName ?? item?.description, "Артикул"),
      quantity,
      unitPrice: netUnit,
      taxPercent,
      lineTotal: priceAfterDiscount,
    };
  });
}

function extractCardDetails(raw: any) {
  const summary = raw?.udito?.paymentSummary ?? null;
  const provider = raw?.paymentMethod?.cardProvider ?? summary?.cardBrand ?? null;
  const last4 = raw?.paymentMethod?.cardLast4 ?? summary?.cardLast4 ?? null;
  return { provider, last4 };
}

function resolvePaymentLabel(raw: any, paidAt: string | null): string {
  const summary = raw?.udito?.paymentSummary ?? null;
  const methodText = String(
    summary?.methodLabel ?? raw?.paymentMethod?.paymentMethodType ?? raw?.paymentMethod?.type ?? ""
  ).toLowerCase();
  if (methodText.includes("offline") || methodText.includes("cash") || methodText.includes("cod") || methodText.includes("наложен")) {
    return "Наложен платеж";
  }
  const { provider, last4 } = extractCardDetails(raw);
  if (provider && last4) return `Платено с карта ${provider} •••• ${last4}`;
  if (provider) return `Платено с карта ${provider}`;
  if (summary?.methodLabel) return `Платено с карта ${summary.methodLabel}`;
  return paidAt ? "Платено" : "Очаква плащане";
}

function formatQrDate(date: Date) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    datePart: `${parts.day}.${parts.month}.${parts.year}`,
    timePart: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("orderId");
  const receiptType = (searchParams.get("type") || "sale") as "sale" | "refund";

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  try {
    await initDb();
    const token = await getActiveWixToken();
    const siteId = token?.site_id ?? null;

    if (!siteId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const record = await getOrderByIdForSite(orderId, siteId);
    if (!record) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const receiptRecord = await getReceiptByOrderIdAndType(orderId, receiptType);
    const company = await getCompanyBySite(siteId);

    // Debug: log template being used
    console.log("PDF Generation - Company template:", company?.receipt_template, "Accent:", company?.accent_color);

    const raw = (record.raw ?? {}) as any;
    const currency = record.currency || "BGN";
    const isRefund = receiptType === "refund";

    // Extract data
    const transactionRef = extractTransactionRef(raw) || "";
    const orderNumber = record.number || record.id || "";
    const receiptIssuedAt = receiptRecord?.issued_at ?? null;
    const paidAt = record.paid_at ?? raw?.paymentStatus?.lastUpdated ?? record.created_at ?? null;
    const effectiveIssuedAt = isRefund && receiptIssuedAt ? receiptIssuedAt : paidAt;
    const showEurPrimary = shouldShowEurPrimary(effectiveIssuedAt);

    const issuedDate = effectiveIssuedAt
      ? new Date(effectiveIssuedAt).toLocaleString("bg-BG", { timeZone: "Europe/Sofia" })
      : "";

    const receiptNumber = receiptRecord?.id
      ? String(receiptRecord.id).padStart(10, "0")
      : String(record.number || record.id).padStart(10, "0");

    const summary = raw?.priceSummary ?? {};
    const refundAmount = receiptRecord?.refund_amount ? Number(receiptRecord.refund_amount) : null;
    const isPartialRefund = isRefund && refundAmount != null;

    // Calculate totals
    let subtotal: number, taxTotal: number, shippingTotal: number, total: number;
    const refundMultiplier = isRefund ? -1 : 1;

    if (isRefund && refundAmount != null) {
      total = -refundAmount;
      shippingTotal = 0;
      const netAmount = refundAmount / 1.2;
      taxTotal = -(refundAmount - netAmount);
      subtotal = -netAmount;
    } else {
      subtotal = refundMultiplier * Number(record.subtotal ?? summary?.subtotal ?? 0);
      taxTotal = refundMultiplier * Number(record.tax_total ?? summary?.tax ?? 0);
      shippingTotal = refundMultiplier * Number(record.shipping_total ?? summary?.shipping ?? 0);
      total = refundMultiplier * Number(record.total ?? summary?.total ?? 0);
    }

    const discountAmount = Number(summary?.discount?.amount ?? 0) || 0;
    const appliedDiscounts = raw?.appliedDiscounts ?? [];
    const discountCode = appliedDiscounts[0]?.coupon?.code ?? null;

    // Items
    let items;
    if (isRefund && refundAmount != null) {
      items = [{
        name: "Възстановена сума (без доставка)",
        quantity: 1,
        unitPrice: refundAmount / 1.2,
        taxPercent: 20,
        lineTotal: refundAmount,
      }];
    } else {
      items = extractLineItems(raw);
    }

    // Shipping
    const shipping = extractShipping(raw);
    const shippingLines = resolveShippingLines(shipping);

    // QR Code
    const storeId = company?.store_id ?? null;
    const qrAmountValue = showEurPrimary && currency === "BGN" ? convertToEur(total) : total;
    const qrAmount = Number.isFinite(qrAmountValue) ? qrAmountValue.toFixed(2) : "0.00";
    const issuedForQr = effectiveIssuedAt ? new Date(effectiveIssuedAt) : new Date();
    const { datePart, timePart } = formatQrDate(issuedForQr);
    const qrContent = transactionRef && storeId
      ? `${storeId}*${transactionRef}*${datePart}*${timePart}*${qrAmount}*${orderNumber}`
      : null;

    let qrDataUrl: string | undefined;
    if (qrContent) {
      qrDataUrl = await QRCode.toDataURL(qrContent, {
        errorCorrectionLevel: "M",
        margin: 4,
        scale: 6,
        color: { dark: "#000000", light: "#ffffff" },
      });
    }

    // Build PDF data
    const pdfData: ReceiptPdfData = {
      receiptNumber,
      receiptType,
      referenceReceiptId: receiptRecord?.reference_receipt_id ?? null,
      issuedDate,
      orderNumber,
      transactionCode: transactionRef,
      storeName: company?.store_name || "Липсва",
      legalName: company?.legal_name || "Липсва",
      addressLine1: company?.address_line1 || "Липсва",
      addressLine2: company?.address_line2 || "",
      city: company?.city || "",
      postalCode: company?.postal_code || "",
      country: company?.country || "България",
      bulstat: company?.bulstat || "Липсва",
      vatNumber: company?.vat_number || "—",
      contactEmail: company?.email || "Липсва",
      contactPhone: company?.phone || "Липсва",
      logoUrl: company?.logo_url || undefined,
      logoWidth: company?.logo_width ?? null,
      logoHeight: company?.logo_height ?? null,
      customerName: extractCustomerName(record, raw),
      customerEmail: extractCustomerEmail(record, raw),
      customerPhone: extractPhone(raw) || undefined,
      shippingLine1: shippingLines.line1,
      shippingLine2: shippingLines.line2,
      shippingCity: shippingLines.city,
      shippingPostalCode: shippingLines.postalCode,
      shippingCountry: shippingLines.country || "България",
      shippingMethod: extractShippingMethod(raw),
      items,
      subtotal,
      discountAmount: discountAmount > 0 ? discountAmount : undefined,
      discountCode: discountCode || undefined,
      shippingTotal,
      taxTotal,
      total,
      currency,
      paymentLabel: resolvePaymentLabel(raw, paidAt),
      paymentDate: effectiveIssuedAt
        ? new Date(effectiveIssuedAt).toLocaleDateString("bg-BG")
        : "—",
      qrDataUrl,
      showEurPrimary,
      isPartialRefund,
      receiptTemplate: (company?.receipt_template as "classic" | "modern" | "dark" | "playful") || "modern",
      accentColor: company?.accent_color || "green",
    };

    // Generate PDF
    const pdfBuffer = await renderToBuffer(<ReceiptPdf data={pdfData} />);

    // Create filename
    const filename = `belezhka-${receiptRecord?.id || orderId}.pdf`;

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF", details: String(error) },
      { status: 500 }
    );
  }
}
