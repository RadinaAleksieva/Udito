import Image from "next/image";
import QRCode from "qrcode";
import { initDb, getCompanyBySite, getOrderByIdForSite, upsertOrder } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";
import {
  extractTransactionRef,
  extractPaymentId,
  extractPaidAtFromPayment,
  extractPaymentSummaryFromPayment,
  extractTransactionRefFromPayment,
  fetchPaymentDetailsById,
  fetchPaymentIdForOrder,
  fetchPaymentRecordForOrder,
  fetchOrderDetails,
  fetchTransactionRefForOrder,
  needsOrderEnrichment,
  pickOrderFields,
} from "@/lib/wix";
import { getReceiptByOrderId } from "@/lib/receipts";
import PrintTrigger from "./print-trigger";
import ReceiptActions from "./receipt-actions";
import "./receipt.css";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type LineItem = {
  name: string;
  quantity: number;
  price: number;
  lineTotal: number;
  taxPercent: number | null;
};

function formatMoney(amount: number | null | undefined, currency: string) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatFx(amount: number, currency: string) {
  const EUR_TO_BGN = 1.95583;
  const BGN_TO_EUR = 0.5138;
  if (!Number.isFinite(amount)) return "";
  if (currency === "BGN") {
    const eur = amount * BGN_TO_EUR;
    return ` / ${formatMoney(eur, "EUR")}`;
  }
  if (currency === "EUR") {
    const bgn = amount * EUR_TO_BGN;
    return ` / ${formatMoney(bgn, "BGN")}`;
  }
  return "";
}

function normalizeText(value: any, fallback = "—") {
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

function parseAmount(value: any) {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").replace(/[^0-9.-]+/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const candidate =
      value?.amount ??
      value?.value ??
      value?.total ??
      value?.totalAmount ??
      null;
    return parseAmount(candidate);
  }
  return null;
}

function resolveTaxPercent(item: LineItem, raw: any) {
  const candidate =
    item.taxPercent ??
    raw?.taxSummary?.rate ??
    raw?.taxSummary?.taxRate ??
    null;
  const parsed = parseAmount(candidate);
  return parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
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
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>(
    (acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }
      return acc;
    },
    {}
  );
  const datePart = `${parts.year}-${parts.month}-${parts.day}`;
  const timePart = `${parts.hour}-${parts.minute}-${parts.second}`;
  return { datePart, timePart };
}

function resolvePaidAt(record: any, raw: any) {
  return (
    record?.paid_at ??
    raw?.paymentStatus?.lastUpdated ??
    raw?.paymentStatus?.updatedDate ??
    raw?.paymentStatus?.updatedAt ??
    null
  );
}

function extractCustomerName(record: any, raw: any) {
  if (record?.customer_name) return record.customer_name;
  const buyer = raw?.buyerInfo ?? raw?.buyer ?? raw?.customerInfo ?? raw?.customer ?? {};
  const billing =
    raw?.billingInfo?.contactDetails ??
    raw?.billingInfo?.address ??
    raw?.billingInfo ??
    {};
  const recipient =
    raw?.recipientInfo?.contactDetails ??
    raw?.recipientInfo ??
    raw?.shippingInfo?.shipmentDetails?.address ??
    raw?.shippingInfo?.deliveryAddress ??
    raw?.shippingAddress ??
    {};
  const first =
    buyer?.firstName ??
    buyer?.givenName ??
    billing?.firstName ??
    billing?.givenName ??
    recipient?.firstName ??
    recipient?.givenName ??
    raw?.contactDetails?.firstName ??
    raw?.contact?.firstName ??
    "";
  const last =
    buyer?.lastName ??
    buyer?.familyName ??
    billing?.lastName ??
    billing?.familyName ??
    recipient?.lastName ??
    recipient?.familyName ??
    raw?.contactDetails?.lastName ??
    raw?.contact?.lastName ??
    "";
  const full = `${first} ${last}`.trim();
  return full || "Липсва";
}

function extractCustomerEmail(record: any, raw: any) {
  return (
    record?.customer_email ??
    raw?.buyerInfo?.email ??
    raw?.buyer?.email ??
    raw?.customerInfo?.email ??
    raw?.customer?.email ??
    raw?.billingInfo?.contactDetails?.email ??
    raw?.billingInfo?.address?.email ??
    raw?.recipientInfo?.contactDetails?.email ??
    raw?.contactDetails?.email ??
    raw?.buyerEmail ??
    "Липсва"
  );
}

function extractLineItems(raw: any): LineItem[] {
  const items =
    raw?.lineItems?.items ??
    raw?.lineItems ??
    raw?.items ??
    raw?.line_items ??
    [];
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => ({
    name: normalizeText(
      item?.name ?? item?.productName ?? item?.description,
      "Артикул"
    ),
    quantity: Number(item?.quantity ?? item?.amount ?? 1),
    price: Number(
      item?.price?.amount ??
        item?.price ??
        item?.price?.value ??
        item?.totalPrice?.amount ??
        item?.total ??
        0
    ),
    lineTotal: Number(
      item?.totalPrice?.amount ??
        item?.total ??
        item?.price?.amount ??
        item?.price ??
        0
    ),
    taxPercent: item?.taxPercent ?? item?.taxRate ?? null,
  }));
}

function extractShipping(raw: any) {
  return (
    raw?.shippingInfo?.shipmentDetails?.address ??
    raw?.shippingInfo?.shipmentDetails?.deliveryAddress ??
    raw?.shippingInfo?.shippingAddress ??
    raw?.shippingInfo?.deliveryAddress ??
    raw?.shippingInfo?.address ??
    raw?.shippingAddress ??
    raw?.deliveryAddress ??
    raw?.address ??
    null
  );
}

function extractShippingMethod(raw: any) {
  const candidate =
    raw?.udito?.deliveryMethod ??
    raw?.shippingInfo?.title ??
    raw?.shippingInfo?.shipmentDetails?.methodName ??
    raw?.shippingInfo?.shipmentDetails?.deliveryMethod ??
    raw?.shippingInfo?.shippingMethodName ??
    raw?.shippingInfo?.shippingService?.name ??
    raw?.shippingInfo?.deliveryOption?.title ??
    raw?.shippingInfo?.deliveryOption?.name ??
    raw?.shippingInfo?.shippingOption?.title ??
    raw?.shippingInfo?.shippingOption?.name ??
    raw?.shippingInfo?.deliveryMethod?.name ??
    raw?.shippingInfo?.deliveryMethod?.type ??
    raw?.deliveryOption?.title ??
    raw?.deliveryOption?.name ??
    raw?.deliveryMethod?.name ??
    raw?.deliveryMethod?.type ??
    raw?.fulfillmentInfo?.deliveryMethod?.name ??
    raw?.fulfillments?.[0]?.deliveryMethod?.name ??
    raw?.fulfillments?.[0]?.deliveryMethod?.type ??
    raw?.fulfillments?.[0]?.shippingMethodName ??
    null;
  return normalizeText(candidate, "Липсва");
}

function resolveShippingLines(shipping: any) {
  if (!shipping) {
    return { line1: "Липсва", line2: "", city: "", postalCode: "", country: "" };
  }
  if (typeof shipping === "string") {
    return { line1: shipping, line2: "", city: "", postalCode: "", country: "" };
  }
  return {
    line1:
      shipping.addressLine1 ??
      shipping.streetAddress ??
      shipping.line1 ??
      shipping.addressLine ??
      shipping.address ??
      "Липсва",
    line2: shipping.addressLine2 ?? shipping.line2 ?? "",
    city: shipping.city ?? shipping.town ?? shipping.locality ?? "",
    postalCode: shipping.postalCode ?? shipping.zipCode ?? shipping.postal ?? "",
    country: shipping.country ?? "",
  };
}

function extractPhone(raw: any) {
  return (
    raw?.buyerInfo?.phone ||
    raw?.buyer?.phone ||
    raw?.customerInfo?.phone ||
    raw?.customer?.phone ||
    raw?.billingInfo?.phone ||
    raw?.billingInfo?.contactDetails?.phone ||
    raw?.billingInfo?.address?.phone ||
    raw?.shippingInfo?.phone ||
    raw?.shippingInfo?.shipmentDetails?.phone ||
    raw?.shippingInfo?.shipmentDetails?.address?.phone ||
    raw?.shippingInfo?.deliveryAddress?.phone ||
    raw?.contactDetails?.phone ||
    raw?.phone ||
    null
  );
}

function extractCardDetails(raw: any) {
  const summary = raw?.udito?.paymentSummary ?? null;
  const provider =
    raw?.paymentMethod?.cardProvider ??
    raw?.payment?.cardProvider ??
    raw?.payment?.cardBrand ??
    raw?.paymentMethod?.brand ??
    summary?.cardBrand ??
    null;
  const last4 =
    raw?.paymentMethod?.cardLast4 ??
    raw?.payment?.cardLast4 ??
    raw?.paymentMethod?.last4 ??
    raw?.payment?.last4 ??
    summary?.cardLast4 ??
    null;
  return { provider, last4 };
}

function resolvePaymentLabel(raw: any, paidAt: string | null) {
  const summary = raw?.udito?.paymentSummary ?? null;
  const methodText = String(
    summary?.methodLabel ??
    raw?.paymentMethod?.paymentMethodType ??
      raw?.paymentMethod?.methodType ??
      raw?.paymentMethod?.type ??
      raw?.paymentMethod?.name ??
      raw?.payment?.method ??
      ""
  ).toLowerCase();
  if (
    methodText.includes("offline") ||
    methodText.includes("cash") ||
    methodText.includes("cod") ||
    methodText.includes("наложен")
  ) {
    return "Наложен платеж";
  }
  const { provider, last4 } = extractCardDetails(raw);
  if (provider && last4) {
    return `Платено с карта ${provider} •••• ${last4}`;
  }
  if (provider) {
    return `Платено с карта ${provider}`;
  }
  if (summary?.methodLabel) {
    return `Платено с карта ${summary.methodLabel}`;
  }
  return paidAt ? "Платено" : "Очаква плащане";
}


export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: { orderId: string };
  searchParams?: { print?: string };
}) {
  await initDb();
  const orderId = params.orderId;
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;
  if (!siteId) {
    notFound();
  }
  const record = await getOrderByIdForSite(orderId, siteId);
  if (!record) {
    notFound();
  }
  const receiptRecord = await getReceiptByOrderId(orderId);
  const companySiteId = record.site_id || siteId;
  const company = companySiteId ? await getCompanyBySite(companySiteId) : null;
  const currency = record.currency || "BGN";
  const raw = (record.raw ?? {}) as any;
  let orderRaw: any = raw;
  const orderSiteId = record.site_id ?? siteId;
  const instanceId = token?.instance_id ?? null;
  let shouldUpdate = false;
  if (needsOrderEnrichment(orderRaw)) {
    const enriched = await fetchOrderDetails({
      orderId,
      siteId: orderSiteId,
      instanceId,
    });
    if (enriched) {
      orderRaw = { ...(orderRaw || {}), ...(enriched as any) };
      shouldUpdate = true;
    }
  }
  const orderNumber = record.number || record.id || "";
  let transactionRef = extractTransactionRef(orderRaw);
  let paymentSummary = orderRaw?.udito?.paymentSummary ?? null;
  if (!transactionRef) {
    const fetchedRef = await fetchTransactionRefForOrder({
      orderId,
      siteId: orderSiteId,
      instanceId,
    });
    if (fetchedRef) {
      transactionRef = fetchedRef;
      orderRaw = {
        ...orderRaw,
        udito: { ...(orderRaw.udito ?? {}), transactionRef: fetchedRef },
      };
      shouldUpdate = true;
    }
  }
  if (!transactionRef || !paymentSummary || !orderRaw?.udito?.paidAt) {
    let paymentId = extractPaymentId(orderRaw);
    let paymentRef: string | null = null;
    let paidAt: string | null = null;
    if (!paymentId) {
      const record = await fetchPaymentRecordForOrder({
        orderId,
        orderNumber: orderNumber || null,
        siteId: orderSiteId,
        instanceId,
      });
      paymentId = record.paymentId;
      paymentRef = record.transactionRef;
      paidAt = record.paidAt;
      paymentSummary = paymentSummary ?? record.paymentSummary ?? null;
      if (record.payment) {
        orderRaw = { ...orderRaw, payment: record.payment };
        shouldUpdate = true;
      }
      if (paidAt || paymentSummary) {
        orderRaw = {
          ...orderRaw,
          udito: {
            ...(orderRaw.udito ?? {}),
            ...(paidAt ? { paidAt } : {}),
            ...(paymentSummary ? { paymentSummary } : {}),
          },
        };
        shouldUpdate = true;
      }
    }
    if (paymentRef) {
      transactionRef = paymentRef;
      orderRaw = {
        ...orderRaw,
        udito: {
          ...(orderRaw.udito ?? {}),
          transactionRef: paymentRef,
          ...(paidAt ? { paidAt } : {}),
          ...(paymentSummary ? { paymentSummary } : {}),
        },
      };
      shouldUpdate = true;
    }
    if (paymentId) {
      const payment = await fetchPaymentDetailsById({
        paymentId,
        siteId: orderSiteId,
        instanceId,
      });
      const paymentRef = extractTransactionRefFromPayment(payment);
      const paidAt = extractPaidAtFromPayment(payment);
      const summary = extractPaymentSummaryFromPayment(payment);
      if (paymentRef || paidAt || summary) {
        transactionRef = paymentRef;
        orderRaw = {
          ...orderRaw,
          udito: {
            ...(orderRaw.udito ?? {}),
            ...(paymentRef ? { transactionRef: paymentRef } : {}),
            ...(paidAt ? { paidAt } : {}),
            ...(summary ? { paymentSummary: summary } : {}),
          },
        };
        shouldUpdate = true;
      }
    }
  }
  if (shouldUpdate) {
    const mapped = pickOrderFields(orderRaw, "backfill");
    await upsertOrder({
      ...mapped,
      siteId: orderSiteId,
      businessId: null,
      raw: orderRaw,
    });
  }

  const items = extractLineItems(orderRaw);
  const shipping = extractShipping(orderRaw);
  const shippingLines = resolveShippingLines(shipping);
  const phone = extractPhone(orderRaw);
  const paidAt = resolvePaidAt(record, orderRaw) ?? record.created_at ?? null;
  const issuedDate = paidAt
    ? new Date(paidAt).toLocaleString("bg-BG", {
        timeZone: "Europe/Sofia",
      })
    : "";
  const receiptNumber = receiptRecord?.id
    ? String(receiptRecord.id).padStart(10, "0")
    : String(record.number || record.id).padStart(10, "0");
  const summary = orderRaw?.priceSummary ?? {};
  const subtotal = Number(record.subtotal ?? summary?.subtotal ?? 0);
  const taxTotal = Number(record.tax_total ?? summary?.tax ?? 0);
  const shippingTotal = Number(record.shipping_total ?? summary?.shipping ?? 0);
  const total = Number(record.total ?? summary?.total ?? 0);
  const paymentLabel = resolvePaymentLabel(orderRaw, paidAt);
  const transactionCode = transactionRef ?? "";
  const template = company?.receipt_template || "classic";
  const storeName = company?.store_name || "Липсва";
  const legalName = company?.legal_name || "Липсва";
  const logoUrl = company?.logo_url || "";
  const addressLine1 = company?.address_line1 || "Липсва";
  const addressLine2 = company?.address_line2 || "";
  const city = company?.city || "";
  const postalCode = company?.postal_code || "";
  const country = company?.country || "България";
  const bulstat = company?.bulstat || "Липсва";
  const vatNumber = company?.vat_number || "—";
  const contactEmail = company?.email || "Липсва";
  const contactPhone = company?.phone || "Липсва";
  const storeId = company?.fiscal_store_id ?? null;
  const customerName = extractCustomerName(record, orderRaw);
  const customerEmail = extractCustomerEmail(record, orderRaw);
  const shippingMethod = extractShippingMethod(orderRaw);
  if (!storeId) {
    return (
      <div className="receipt-shell" data-template={template}>
        <ReceiptActions />
        <main className="receipt">
          <h2>Липсва уникален код на магазина</h2>
          <p>
            За този магазин не е въведен уникален код на магазина. Касова
            бележка не може да бъде издадена.
          </p>
          <p>
            Отворете <a href="/settings">Настройки</a> и въведете кода.
          </p>
        </main>
      </div>
    );
  }
  const qrAmount = Number.isFinite(total) ? total.toFixed(2) : "0.00";
  const issuedForQr = paidAt ? new Date(paidAt) : new Date();
  const { datePart, timePart } = formatQrDate(issuedForQr);
  const qrContent = transactionRef
    ? `${storeId}*${transactionRef}*${datePart}*${timePart}*${qrAmount}*${currency}*#${orderNumber}`
    : null;
  const qrDataUrl = qrContent
    ? await QRCode.toDataURL(qrContent, {
        errorCorrectionLevel: "M",
        margin: 4,
        scale: 6,
        color: { dark: "#000000", light: "#ffffff" },
      })
    : null;

  return (
    <div className="receipt-shell" data-template={template}>
      <PrintTrigger enabled={searchParams?.print === "1"} />
      <ReceiptActions />
      <main className="receipt">
        <header className="receipt-header">
          <div className="logo-block">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt="Лого на магазина"
                className="brand-logo"
                width={90}
                height={90}
                unoptimized
              />
            ) : (
              <div className="logo-fallback">{storeName}</div>
            )}
          </div>
          <div className="receipt-meta">
            <p className="receipt-title">
              Бележка <strong>{receiptNumber}</strong>
            </p>
            <p className="meta-single">
              Дата и час на издаване: <strong>{issuedDate}</strong>
            </p>
            <p>
              № на поръчка: <strong>{orderNumber}</strong>
            </p>
            <p className="meta-single">
              Уникален код на транзакцията: <strong>{transactionCode}</strong>
            </p>
          </div>
        </header>

        <section className="section-block info-grid">
          <div className="shop-meta">
            <h2>Данни за търговеца</h2>
            <p className="shop-name">{storeName}</p>
            <p>{legalName}</p>
            <p>{addressLine1}</p>
            {addressLine2 ? <p>{addressLine2}</p> : null}
            <p>{postalCode} {city}</p>
            <p>{country}</p>
            <p>ЕИК: {bulstat}</p>
            <p>ДДС №: {vatNumber}</p>
          </div>
          <div className="client-block">
            <h2>Данни за клиента</h2>
            <p>{customerName}</p>
            <p>{shippingLines.line1}</p>
            {shippingLines.line2 ? <p>{shippingLines.line2}</p> : null}
            <p>
              {shippingLines.postalCode} {shippingLines.city}
            </p>
            <p>{shippingLines.country || "България"}</p>
            <p>{customerEmail}</p>
            <p>{phone || "Липсва"}</p>
            <p>Метод на доставка: {shippingMethod}</p>
          </div>
        </section>

        <section className="section-block items-block">
          <table className="items">
            <thead>
              <tr>
                <th>Артикули</th>
                <th>Количество</th>
                <th>Цена</th>
                <th>
                  Данък<br />
                  <span className="tax-sub">(20%)</span>
                </th>
                <th>Общо</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              ) : (
                items.map((item, idx) => (
                  <tr key={`${record.id}-item-${idx}`}>
                    <td>{item.name}</td>
                    <td>{item.quantity}</td>
                    <td>
                      {(() => {
                        const quantity = Number(item.quantity || 0) || 1;
                        const grossUnit = Number.isFinite(item.price)
                          ? item.price
                          : Number.isFinite(item.lineTotal)
                            ? item.lineTotal / quantity
                            : null;
                        if (grossUnit == null) return "—";
                        const taxPercent = resolveTaxPercent(item, raw);
                        const netUnit = grossUnit / (1 + taxPercent / 100);
                        return formatMoney(netUnit, currency);
                      })()}
                    </td>
                    <td>
                      {resolveTaxPercent(item, raw)}%
                    </td>
                    <td>
                      {(() => {
                        if (Number.isFinite(item.lineTotal)) {
                          return formatMoney(item.lineTotal, currency);
                        }
                        if (!Number.isFinite(item.price)) return "—";
                        return formatMoney(item.price * item.quantity, currency);
                      })()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="section-block totals">
          <div className="totals-right">
            <div className="row">
              <span>Междинна сума</span>
              <strong>{formatMoney(subtotal, currency)}</strong>
            </div>
            <div className="row">
              <span>Такса за доставка</span>
              <strong>{formatMoney(shippingTotal, currency)}</strong>
            </div>
            <div className="row">
              <span>Данъци</span>
              <strong>{formatMoney(taxTotal, currency)}</strong>
            </div>
            <div className="row total">
              <span>Обща сума</span>
              <strong>
                {formatMoney(total, currency)}
                {formatFx(total, currency)}
              </strong>
            </div>
          </div>
        </section>

        <section className="section-block">
          <h2>Данни за плащане</h2>
          <div className="payment-row">
            <span>
              {paidAt ? new Date(paidAt).toLocaleDateString("bg-BG") : "—"}
            </span>
            <span>{paymentLabel}</span>
            <span>
              {formatMoney(total, currency)}
              {formatFx(total, currency)}
            </span>
          </div>
        </section>

        <section className="section-block legal">
          <div className="legal-row">
            <div className="legal-left">
              <p className="contact-label">Данни за контакт</p>
              <p className="contact-detail">{contactEmail}</p>
              <p className="contact-detail">{contactPhone}</p>
            </div>
            <div className="qr-block">
              {qrDataUrl ? (
                <Image
                  className="qr-image"
                  src={qrDataUrl}
                  alt="QR код"
                  width={96}
                  height={96}
                  unoptimized
                />
              ) : (
                <p className="qr-missing">
                  Липсва уникален код на транзакцията за QR.
                </p>
              )}
            </div>
          </div>
        </section>
        <p className="note">
          Този документ е електронна електронна бележка, предоставена на клиента по електронен път.
        </p>
      </main>
    </div>
  );
}
