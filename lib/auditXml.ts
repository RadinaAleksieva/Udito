/**
 * Audit XML generator for Bulgarian NRA (НАП) compliance
 * Format follows the dec_audit.xsd schema
 */

export type AuditLineItem = {
  name: string;
  quantity: number;
  priceWithVat: number;      // Единична цена С ДДС
  vatRate: number;           // ДДС ставка (напр. 20)
};

export type AuditOrder = {
  orderNumber: string;       // ord_n - Уникален номер на поръчка
  orderDate: string;         // ord_d - Дата на поръчка (YYYY-MM-DD)
  receiptNumber: string;     // doc_n - Номер на бележка
  receiptDate: string;       // doc_date - Дата на бележка (YYYY-MM-DD)
  items: AuditLineItem[];    // art - Артикули
  discount: number;          // ord_disc - Отстъпка
  paymentType: number;       // paym - Тип плащане (1-6)
  transactionRef?: string;   // trans_n - Референция на транзакция
  processorId?: string;      // proc_id - ID на процесор
};

export type AuditReturn = {
  orderNumber: string;       // r_ord_n - Номер на върната поръчка
  amount: number;            // r_amount - Сума на връщане
  returnDate: string;        // r_date - Дата на връщане (YYYY-MM-DD)
  returnPaymentType: number; // r_paym - Тип на връщане (1-4)
};

export type AuditExportInput = {
  eik: string;               // ЕИК на фирмата (9-13 символа)
  shopNumber: string;        // e_shop_n - Уникален номер на магазина (RF...)
  domainName: string;        // domain_name - Домейн на магазина
  shopType: 1 | 2;           // e_shop_type - Тип магазин
  creationDate: string;      // creation_date - Дата на създаване (YYYY-MM-DD)
  month: string;             // mon - Месец (01-12)
  year: number;              // god - Година
  orders: AuditOrder[];      // Поръчки
  returns?: AuditReturn[];   // Върнати поръчки (опционално)
};

/**
 * Escape special XML characters and clean up text
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "")  // Remove quotes instead of escaping
    .replace(/'/g, "")  // Remove single quotes too
    .replace(/„/g, "")  // Remove Bulgarian opening quote
    .replace(/"/g, "")  // Remove Bulgarian closing quote
    .trim();
}

/**
 * Format number to 2 decimal places
 */
function formatDecimal(value: number): string {
  return value.toFixed(2);
}

/**
 * Calculate price without VAT from price with VAT
 */
function priceWithoutVat(priceWithVat: number, vatRate: number): number {
  return priceWithVat / (1 + vatRate / 100);
}

/**
 * Calculate VAT amount from price with VAT
 */
function vatAmount(priceWithVat: number, vatRate: number): number {
  const priceNet = priceWithoutVat(priceWithVat, vatRate);
  return priceWithVat - priceNet;
}

/**
 * Build XML for a single line item (artenum)
 */
function buildItemXml(item: AuditLineItem): string {
  const unitPriceNet = priceWithoutVat(item.priceWithVat, item.vatRate);
  const lineTotal = item.priceWithVat * item.quantity;
  const lineVat = vatAmount(item.priceWithVat, item.vatRate) * item.quantity;

  return `<artenum>
<art_name>${escapeXml(item.name.substring(0, 200))}</art_name>
<art_quant>${formatDecimal(item.quantity)}</art_quant>
<art_price>${formatDecimal(unitPriceNet)}</art_price>
<art_vat_rate>${item.vatRate}</art_vat_rate>
<art_vat>${formatDecimal(lineVat)}</art_vat>
<art_sum>${formatDecimal(lineTotal)}</art_sum>
</artenum>`;
}

/**
 * Build XML for a single order (orderenum)
 */
function buildOrderXml(order: AuditOrder): string {
  // Calculate totals from items
  let totalWithVat = 0;
  let totalVat = 0;

  for (const item of order.items) {
    const lineTotal = item.priceWithVat * item.quantity;
    const lineVat = vatAmount(item.priceWithVat, item.vatRate) * item.quantity;
    totalWithVat += lineTotal;
    totalVat += lineVat;
  }

  const totalWithoutVat = totalWithVat - totalVat;
  const discount = order.discount || 0;

  const itemsXml = order.items.map(buildItemXml).join("\n");

  return `<orderenum>
<ord_n>${escapeXml(order.orderNumber.substring(0, 300))}</ord_n>
<ord_d>${order.orderDate}</ord_d>
<doc_n>${escapeXml(order.receiptNumber)}</doc_n>
<doc_date>${order.receiptDate}</doc_date>
<art>
${itemsXml}
</art>
<ord_total1>${formatDecimal(totalWithoutVat)}</ord_total1>
<ord_disc>${formatDecimal(discount)}</ord_disc>
<ord_vat>${formatDecimal(totalVat)}</ord_vat>
<ord_total2>${formatDecimal(totalWithVat)}</ord_total2>
<paym>${order.paymentType}</paym>
${order.transactionRef ? `<trans_n>${escapeXml(order.transactionRef.substring(0, 200))}</trans_n>` : "<trans_n/>"}
${order.processorId ? `<proc_id>${escapeXml(order.processorId.substring(0, 200))}</proc_id>` : "<proc_id/>"}
</orderenum>`;
}

/**
 * Build XML for a single return (rorderenum)
 */
function buildReturnXml(ret: AuditReturn): string {
  return `<rorderenum>
<r_ord_n>${escapeXml(ret.orderNumber.substring(0, 300))}</r_ord_n>
<r_amount>${formatDecimal(ret.amount)}</r_amount>
<r_date>${ret.returnDate}</r_date>
<r_paym>${ret.returnPaymentType}</r_paym>
</rorderenum>`;
}

/**
 * Build the complete audit XML file following NRA schema
 * Encoding is windows-1251 as required by НАП
 */
export function buildAuditXml(input: AuditExportInput): string {
  const ordersXml = input.orders.map(buildOrderXml).join("\n");

  const returns = input.returns || [];
  const returnsCount = returns.length;
  const returnsTotal = returns.reduce((sum, r) => sum + r.amount, 0);
  const returnsXml = returns.length > 0
    ? returns.map(buildReturnXml).join("\n")
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<audit>
<eik>${escapeXml(input.eik)}</eik>
<e_shop_n>${escapeXml(input.shopNumber)}</e_shop_n>
<domain_name>${escapeXml(input.domainName)}</domain_name>
<e_shop_type>${input.shopType}</e_shop_type>
<creation_date>${input.creationDate}</creation_date>
<mon>${input.month}</mon>
<god>${input.year}</god>
<order>
${ordersXml}
</order>
<r_ord>${returnsCount}</r_ord>
<rorder>
${returnsXml}
</rorder>
<r_total>${formatDecimal(returnsTotal)}</r_total>
</audit>`;
}

/**
 * Determine payment type based on payment method
 * 1 - Плащане по чл. 3 (ЗДДС при доставка)
 * 2 - Наложен платеж - куриерска услуга
 * 3 - Виртуална карта в ПОС
 * 4 - Плащане по банкова сметка (карта онлайн)
 * 5 - Друг начин, изискващ документ
 * 6 - Плащане, представено в касов апарат
 */
export function determinePaymentType(paymentMethod: string | null | undefined): number {
  if (!paymentMethod) return 4; // Default to online card payment

  const method = paymentMethod.toLowerCase();

  if (
    method.includes("cod") ||
    method.includes("наложен") ||
    method.includes("cash on delivery") ||
    method.includes("offline")  // Wix offlinePayment = наложен платеж
  ) {
    return 2; // Наложен платеж - куриерска услуга
  }

  if (method.includes("в брой") || method.includes("cash register")) {
    return 6; // Касов апарат
  }

  if (method.includes("pos") || method.includes("terminal")) {
    return 3; // ПОС терминал
  }

  if (method.includes("bank") || method.includes("transfer") || method.includes("превод")) {
    return 4; // Банкова сметка
  }

  // Default: online card payment
  return 4;
}
