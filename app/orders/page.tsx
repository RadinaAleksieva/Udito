import TopNav from "../components/top-nav";
import MonthFilter from "../components/month-filter";
import AutoSync from "../overview/auto-sync";
import {
  initDb,
  listAllDetailedOrders,
  listAllDetailedOrdersForSite,
  listDetailedOrdersForPeriodForSite,
} from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";
import {
  deriveOrderCreatedAt,
  deriveOrderMoney,
  deriveOrderNumber,
  isArchivedOrder,
} from "@/lib/order-display";
import { extractTransactionRef, extractPaymentSummaryFromPayment } from "@/lib/wix";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  number: string | null;
  payment_status: string | null;
  status: string | null;
  created_at: string | null;
  paid_at: string | null;
  total: string | null;
  currency: string | null;
  customer_name: string | null;
  customer_email: string | null;
  raw: unknown;
  source: string | null;
};

type LineItem = {
  name: string;
  quantity: number | string;
  price: string | null;
  lineTotal: string | null;
  taxAmount: string | null;
  taxPercent: string | number | null;
  discount: string | null;
  identities: string[];
};

function formatMoney(amount: number | string | null | undefined, currency: string | null) {
  if (amount == null || !currency) return "—";
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatPaymentStatus(status: string | null) {
  if (!status) return "—";
  if (status === "PAID") return "Платена";
  if (status === "NOT_PAID") return "Неплатена";
  if (status === "PARTIALLY_PAID") return "Частично платена";
  return status;
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
    quantity: item?.quantity ?? item?.amount ?? 1,
    price:
      item?.price?.amount ??
      item?.price ??
      item?.totalPrice?.amount ??
      item?.total ??
      null,
    lineTotal:
      item?.totalPrice?.amount ??
      item?.total ??
      item?.price?.amount ??
      item?.price ??
      null,
    taxAmount:
      item?.tax?.amount ??
      item?.taxAmount ??
      item?.tax ??
      null,
    taxPercent:
      item?.taxPercent ??
      item?.taxRate ??
      null,
    discount:
      item?.discount?.amount ??
      item?.discount ??
      null,
    identities: Array.isArray(item?.externalProductIdentities)
      ? item.externalProductIdentities
          .map((entry: any) => normalizeText(entry, ""))
          .filter((entry: string) => entry.length > 0)
      : [],
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
    raw?.recipientInfo?.address ??
    raw?.recipientInfo?.contactDetails?.address ??
    raw?.billingInfo?.address ??
    raw?.billingInfo?.contactDetails?.address ??
    raw?.billingInfo?.contactDetails ??
    raw?.buyerInfo?.address ??
    raw?.buyer?.address ??
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
    raw?.deliveryInfo?.deliveryOption?.title ??
    raw?.deliveryInfo?.deliveryOption?.name ??
    raw?.deliveryInfo?.deliveryMethod?.name ??
    raw?.deliveryInfo?.deliveryMethod?.type ??
    raw?.deliveryMethod?.displayName ??
    raw?.deliveryMethod?.name ??
    raw?.deliveryMethod?.type ??
    raw?.delivery?.method?.name ??
    raw?.delivery?.method?.type ??
    raw?.deliveryDetails?.method ??
    raw?.deliveryDetails?.name ??
    raw?.deliveryOption?.title ??
    raw?.deliveryOption?.name ??
    raw?.deliveryMethod?.name ??
    raw?.deliveryMethod?.type ??
    raw?.fulfillmentInfo?.deliveryMethod?.name ??
    raw?.fulfillments?.[0]?.deliveryMethod?.name ??
    raw?.fulfillments?.[0]?.deliveryMethod?.type ??
    raw?.fulfillments?.[0]?.shippingMethodName ??
    raw?.fulfillments?.[0]?.trackingInfo?.shippingProvider ??
    null;
  return normalizeText(candidate, "—");
}

function resolveShippingLines(shipping: any) {
  if (!shipping) {
    return { line1: "—", line2: "", city: "—", postalCode: "" };
  }
  if (typeof shipping === "string") {
    return { line1: shipping, line2: "", city: "—", postalCode: "" };
  }
  const line1 =
    shipping.addressLine1 ??
    shipping.streetAddress ??
    shipping.line1 ??
    shipping.addressLine ??
    shipping.address ??
    "—";
  const line2 = shipping.addressLine2 ?? shipping.line2 ?? "";
  const city = shipping.city ?? shipping.town ?? shipping.locality ?? "—";
  const postalCode =
    shipping.postalCode ?? shipping.zipCode ?? shipping.postal ?? "";
  return { line1, line2, city, postalCode };
}

function extractContacts(order: OrderRow, raw: any) {
  const email =
    order.customer_email ??
    raw?.buyerInfo?.email ??
    raw?.buyer?.email ??
    raw?.customer?.email ??
    raw?.customerInfo?.email ??
    null;
  const phone =
    raw?.buyerInfo?.phone ??
    raw?.buyer?.phone ??
    raw?.customer?.phone ??
    raw?.customerInfo?.phone ??
    raw?.billingInfo?.contactDetails?.phone ??
    raw?.billingInfo?.address?.phone ??
    raw?.shippingInfo?.shipmentDetails?.phone ??
    raw?.shippingInfo?.shipmentDetails?.address?.phone ??
    raw?.shippingInfo?.deliveryAddress?.phone ??
    raw?.phone ??
    null;
  return {
    email: email || null,
    phone: phone || null,
  };
}

function extractCustomerName(order: OrderRow, raw: any) {
  if (order.customer_name) return order.customer_name;
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
    buyer?.name ??
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
  return full || "—";
}

function extractPaymentLabel(raw: any, status: string | null) {
  const summary = raw?.udito?.paymentSummary ?? null;
  const summaryText = summary?.methodText ?? summary?.methodLabel ?? "";
  const methodCandidate =
    summaryText ||
    (raw?.paymentMethod?.paymentMethodType ??
      raw?.paymentMethod?.methodType ??
      raw?.paymentMethod?.type ??
      raw?.paymentMethod?.name ??
      raw?.paymentMethodSummary?.paymentMethodType ??
      raw?.paymentMethodSummary?.methodType ??
      raw?.paymentMethodSummary?.type ??
      raw?.paymentMethodSummary?.name ??
      raw?.payments?.[0]?.paymentMethod ??
      raw?.payments?.[0]?.paymentMethodType ??
      raw?.payments?.[0]?.method ??
      raw?.payments?.[0]?.paymentType ??
      raw?.payments?.[0]?.provider ??
      raw?.payment?.method ??
      raw?.payment?.type ??
      raw?.paymentType ??
      raw?.transactions?.[0]?.paymentMethod ??
      "");
  const methodText = String(methodCandidate).toLowerCase();
  const isOffline =
    methodText.includes("offline") ||
    methodText.includes("cash") ||
    methodText.includes("cod") ||
    methodText.includes("наложен");
  if (isOffline) {
    return "Наложен платеж";
  }
  const provider =
    raw?.paymentMethod?.cardProvider ??
    raw?.payment?.cardProvider ??
    raw?.payment?.cardBrand ??
    raw?.paymentMethod?.brand ??
    raw?.payments?.[0]?.card?.brand ??
    raw?.payments?.[0]?.card?.type ??
    summary?.cardBrand ??
    null;
  const last4 =
    raw?.paymentMethod?.cardLast4 ??
    raw?.payment?.cardLast4 ??
    raw?.paymentMethod?.last4 ??
    raw?.payment?.last4 ??
    raw?.payments?.[0]?.card?.last4 ??
    raw?.payments?.[0]?.card?.lastFourDigits ??
    summary?.cardLast4 ??
    null;
  const isCard =
    methodText.includes("card") ||
    methodText.includes("credit") ||
    methodText.includes("debit") ||
    Boolean(provider) ||
    Boolean(last4);
  if (isCard) {
    if (!provider && !last4 && summary?.methodLabel) {
      return `Платено с карта ${summary.methodLabel}`;
    }
    return "Платено с карта";
  }
  return status === "PAID" ? "Платена" : "Неплатена";
}

function formatOrderStatusLabel(order: OrderRow, raw: any) {
  const statusText = String(order.status ?? raw?.status ?? "").toLowerCase();
  if (statusText.includes("cancel")) return "Отказана";
  const paymentStatus = (order.payment_status || "").toUpperCase();
  if (paymentStatus === "PAID") return "Платена";
  if (paymentStatus === "PARTIALLY_PAID") return "Частично платена";
  if (paymentStatus === "NOT_PAID") return "Очаква плащане";
  return "—";
}

function extractTotals(order: OrderRow, raw: any) {
  const summary = raw?.priceSummary ?? raw?.totals ?? {};
  const toAmount = (value: any) => {
    if (value == null) return null;
    if (typeof value === "object") {
      return (
        value?.amount ??
        value?.value ??
        value?.total ??
        value?.totalAmount ??
        null
      );
    }
    return value;
  };
  return {
    subtotal:
      toAmount(summary?.subtotal) ??
      toAmount(raw?.subtotal ?? raw?.subtotalTotal) ??
      null,
    shipping:
      toAmount(summary?.shipping) ??
      toAmount(raw?.shippingTotal ?? raw?.shipping) ??
      null,
    tax:
      toAmount(summary?.tax) ??
      toAmount(raw?.taxTotal ?? raw?.tax) ??
      null,
    discount:
      toAmount(summary?.discount) ??
      toAmount(raw?.discountTotal ?? raw?.discount) ??
      null,
    total:
      toAmount(summary?.total) ??
      toAmount(order.total) ??
      null,
  };
}

function extractPayment(raw: any, order: OrderRow) {
  const payment = raw?.paymentMethod ?? raw?.paymentMethodSummary ?? {};
  const summary = raw?.udito?.paymentSummary ?? null;

  // Pick the best payment from orderTransactions (prioritize APPROVED/COMPLETED/REFUNDED)
  let bestPayment = null;
  const orderTxPayments = raw?.orderTransactions?.payments;
  if (Array.isArray(orderTxPayments) && orderTxPayments.length > 0) {
    const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
    bestPayment = orderTxPayments.find(
      (p: any) => validStatuses.includes(p?.regularPaymentDetails?.status)
    ) || orderTxPayments[0];
  }

  // Extract payment summary from the best payment
  const paymentSummary = bestPayment ? extractPaymentSummaryFromPayment(bestPayment) : null;

  return {
    provider: payment?.name ?? payment?.methodType ?? "—",
    transactionId: extractTransactionRef(raw),
    cardProvider:
      payment?.cardProvider ??
      raw?.payment?.cardProvider ??
      paymentSummary?.cardBrand ??
      summary?.cardBrand ??
      null,
    cardLast4:
      payment?.cardLast4 ??
      payment?.last4 ??
      raw?.payment?.cardLast4 ??
      paymentSummary?.cardLast4 ??
      summary?.cardLast4 ??
      null,
    paidAt: order.paid_at,
  };
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: { month?: string };
}) {
  await initDb();
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? token?.instance_id ?? null;
  const now = new Date();
  const monthParam = searchParams?.month || "all";
  const monthMatch = monthParam.match(/^(\d{4})-(\d{2})$/);
  const monthOptions = [
    { value: "all", label: "Всички месеци" },
    ...Array.from({ length: 12 }, (_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth() - idx, 1);
      const value = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;
      return {
        value,
        label: date.toLocaleDateString("bg-BG", {
          year: "numeric",
          month: "long",
        }),
      };
    }),
  ];
  const monthValue = monthMatch ? monthParam : "all";
  const rangeStart = monthMatch
    ? new Date(
        Number(monthMatch[1]),
        Number(monthMatch[2]) - 1,
        1,
        0,
        0,
        0
      ).toISOString()
    : null;
  const rangeEnd = monthMatch
    ? new Date(
        Number(monthMatch[1]),
        Number(monthMatch[2]),
        0,
        23,
        59,
        59,
        999
      ).toISOString()
    : null;
  const orders =
    monthMatch && rangeStart && rangeEnd && siteId
      ? await listDetailedOrdersForPeriodForSite(rangeStart, rangeEnd, siteId)
      : siteId
        ? await listAllDetailedOrdersForSite(siteId)
        : await listAllDetailedOrders();

  const dbOrders = orders as OrderRow[];
  const displayOrders = dbOrders.filter((order) => {
    const raw = order.raw as any;
    return !isArchivedOrder(raw);
  });
  const sortedOrders = [...displayOrders].sort((a, b) => {
    const numA = Number(deriveOrderNumber(a.raw as any, a.number));
    const numB = Number(deriveOrderNumber(b.raw as any, b.number));
    if (Number.isFinite(numA) && Number.isFinite(numB)) {
      return numB - numA;
    }
    const dateA = new Date(deriveOrderCreatedAt(a.raw as any, a.created_at) || 0).valueOf();
    const dateB = new Date(deriveOrderCreatedAt(b.raw as any, b.created_at) || 0).valueOf();
    return dateB - dateA;
  });

  return (
    <main>
      <AutoSync />
      <TopNav title="Поръчки" />
      <div className="container">
        <section className="orders">
          <h2>Поръчки</h2>
          <MonthFilter
            value={monthValue}
            options={monthOptions}
            label="Месец"
          />
          {sortedOrders.length === 0 ? (
            <p>Няма поръчки за избрания период.</p>
          ) : (
            <div className="order-cards">
              {sortedOrders.map((order) => {
                const raw = order.raw as any;
                const items = extractLineItems(raw);
                const shipping = extractShipping(raw);
                const shippingLines = resolveShippingLines(shipping);
                const shippingMethod = extractShippingMethod(raw);
                const contacts = extractContacts(order, raw);
                const totals = extractTotals(order, raw);
                const payment = extractPayment(raw, order);
                const derivedMoney = deriveOrderMoney(
                  raw,
                  order.total,
                  order.currency ?? null
                );
                const createdAt = deriveOrderCreatedAt(raw, order.created_at);
                const number = deriveOrderNumber(raw, order.number);
                const customerName = extractCustomerName(order, raw);
                const discountValue = parseAmount(totals.discount);
                const hasItemDiscount = items.some(
                  (item) => (parseAmount(item.discount) ?? 0) > 0
                );
                const showDiscount = (discountValue ?? 0) > 0 || hasItemDiscount;
                const statusText = String(order.status ?? "").toLowerCase();
                const isCancelled = statusText.includes("cancel");
                const paymentStatus = (order.payment_status || "").toUpperCase();
                const isPaid = paymentStatus === "PAID";
                const isUnpaid =
                  paymentStatus === "NOT_PAID" || paymentStatus === "PARTIALLY_PAID";
                const showPaymentDetails = isPaid && !statusText.includes("cancel");
                const paymentLabel = extractPaymentLabel(raw, paymentStatus);
                return (
                  <article
                    className={[
                      "order-card",
                      isCancelled ? "order-card--cancelled" : "",
                      isUnpaid ? "order-card--unpaid" : "",
                      isPaid ? "order-card--paid" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={order.id}
                  >
                    <div className="order-card__header">
                      <div>
                        <h3>{number || order.id}</h3>
                        <p className="order-card__meta">
                          {createdAt
                            ? new Date(createdAt).toLocaleString("bg-BG", {
                                timeZone: "Europe/Sofia",
                              })
                            : "—"}
                        </p>
                      </div>
                      <div className="order-card__status">
                        <span>{formatPaymentStatus(order.payment_status)}</span>
                        <strong>
                          {formatMoney(
                            derivedMoney.totalAmount,
                            derivedMoney.currency
                          )}
                        </strong>
                      </div>
                    </div>
                    <div className="order-card__body">
                      <div>
                        <p className="order-card__label">Клиент</p>
                        <p>{customerName}</p>
                      </div>
                      <div>
                        <p className="order-card__label">Контакти</p>
                        <p className="order-card__meta">
                          {contacts.email || "—"}
                        </p>
                        <p className="order-card__meta">
                          {contacts.phone || "—"}
                        </p>
                      </div>
                      <div>
                        <p className="order-card__label">Доставка</p>
                        <p className="order-card__meta">{shippingLines.line1}</p>
                        {shippingLines.line2 ? (
                          <p className="order-card__meta">{shippingLines.line2}</p>
                        ) : null}
                        <p className="order-card__meta">
                          {shippingLines.city} {shippingLines.postalCode}
                        </p>
                        <p className="order-card__meta">
                          Метод: {shippingMethod}
                        </p>
                      </div>
                      <div>
                        <p className="order-card__label">Статус</p>
                        <p>{formatOrderStatusLabel(order, raw)}</p>
                        <p className="order-card__meta">Платена: {isPaid ? "Да" : "Не"}</p>
                      </div>
                      <div>
                        <p className="order-card__label">Плащане</p>
                        <p>{paymentLabel}</p>
                        <p className="order-card__meta">
                          {showPaymentDetails && payment.cardProvider && payment.cardLast4
                            ? `${payment.cardProvider} •••• ${payment.cardLast4}`
                            : "—"}
                        </p>
                        <p className="order-card__meta">
                          {showPaymentDetails && payment.transactionId
                            ? `Транзакция: ${payment.transactionId}`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="order-card__label">Суми</p>
                        <p className="order-card__meta">
                          Междинна: {formatMoney(totals.subtotal, order.currency)}
                        </p>
                        <p className="order-card__meta">
                          Доставка: {formatMoney(totals.shipping, order.currency)}
                        </p>
                        <p className="order-card__meta">
                          Данъци: {formatMoney(totals.tax, order.currency)}
                        </p>
                        {showDiscount && (discountValue ?? 0) > 0 ? (
                          <p className="order-card__meta">
                            Отстъпка: {formatMoney(discountValue, order.currency)}
                          </p>
                        ) : null}
                        <p className="order-card__meta">
                          Общо: {formatMoney(derivedMoney.totalAmount, derivedMoney.currency)}
                        </p>
                      </div>
                    </div>
                    <div className="order-card__items-block">
                      <p className="order-card__label">Артикули</p>
                      {items.length === 0 ? (
                        <p className="order-card__meta">Няма артикули.</p>
                      ) : (
                        <table className="order-items">
                          <colgroup>
                            <col style={{ width: "38%" }} />
                            <col style={{ width: "10%" }} />
                            <col style={{ width: "14%" }} />
                            <col style={{ width: "10%" }} />
                            {showDiscount ? <col style={{ width: "14%" }} /> : null}
                            <col style={{ width: showDiscount ? "14%" : "28%" }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Артикул</th>
                              <th>Кол.</th>
                              <th>Ед. цена</th>
                              <th>Данък %</th>
                              {showDiscount ? <th>Отстъпка</th> : null}
                              <th>Общо</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item, idx) => (
                              <tr key={`${order.id}-item-${idx}`}>
                                <td>
                                  {item.name}
                                  {item.identities.length > 0 ? (
                                    <div className="order-card__meta">
                                      {item.identities.join(", ")}
                                    </div>
                                  ) : null}
                                </td>
                                <td>{item.quantity}</td>
                                <td>
                                  {(() => {
                                    const quantity = Number(item.quantity || 0) || 1;
                                    const grossUnit =
                                      parseAmount(item.price) ??
                                      (parseAmount(item.lineTotal) != null
                                        ? Number(parseAmount(item.lineTotal)) / quantity
                                        : null);
                                    if (grossUnit == null) return "—";
                                    const taxPercent = resolveTaxPercent(item, raw);
                                    const netUnit = grossUnit / (1 + taxPercent / 100);
                                    return formatMoney(netUnit, order.currency);
                                  })()}
                                </td>
                                <td>{resolveTaxPercent(item, raw)}%</td>
                                {showDiscount ? (
                                  <td>
                                    {parseAmount(item.discount)
                                      ? formatMoney(parseAmount(item.discount), order.currency)
                                      : "—"}
                                  </td>
                                ) : null}
                                <td>
                                  {(() => {
                                    const lineTotal = parseAmount(item.lineTotal);
                                    if (lineTotal != null) {
                                      return formatMoney(lineTotal, order.currency);
                                    }
                                    const grossUnit = parseAmount(item.price);
                                    if (grossUnit == null) return "—";
                                    const totalGross =
                                      grossUnit * Number(item.quantity || 0);
                                    return formatMoney(totalGross, order.currency);
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
