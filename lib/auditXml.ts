export type AuditOrder = {
  id: string;
  number: string;
  createdAt: string;
  paidAt?: string;
  totalAmount: number;
  currency: string;
  paymentMethod?: string;
  customerName?: string;
  customerEmail?: string;
};

export type AuditExportInput = {
  merchantId: string;
  merchantName: string;
  vatNumber?: string;
  periodStart: string;
  periodEnd: string;
  orders: AuditOrder[];
};

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export function buildAuditXml(input: AuditExportInput) {
  const ordersXml = input.orders
    .map((order) => {
      return [
        "<Order>",
        `<OrderId>${escapeXml(order.id)}</OrderId>`,
        `<OrderNumber>${escapeXml(order.number)}</OrderNumber>`,
        `<CreatedAt>${escapeXml(order.createdAt)}</CreatedAt>`,
        order.paidAt ? `<PaidAt>${escapeXml(order.paidAt)}</PaidAt>` : "",
        `<TotalAmount>${order.totalAmount.toFixed(2)}</TotalAmount>`,
        `<Currency>${escapeXml(order.currency)}</Currency>`,
        order.paymentMethod
          ? `<PaymentMethod>${escapeXml(order.paymentMethod)}</PaymentMethod>`
          : "",
        order.customerName
          ? `<CustomerName>${escapeXml(order.customerName)}</CustomerName>`
          : "",
        order.customerEmail
          ? `<CustomerEmail>${escapeXml(order.customerEmail)}</CustomerEmail>`
          : "",
        "</Order>",
      ]
        .filter(Boolean)
        .join("");
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<AuditExport>` +
    `<Header>` +
    `<MerchantId>${escapeXml(input.merchantId)}</MerchantId>` +
    `<MerchantName>${escapeXml(input.merchantName)}</MerchantName>` +
    (input.vatNumber
      ? `<VatNumber>${escapeXml(input.vatNumber)}</VatNumber>`
      : "") +
    `<PeriodStart>${escapeXml(input.periodStart)}</PeriodStart>` +
    `<PeriodEnd>${escapeXml(input.periodEnd)}</PeriodEnd>` +
    `</Header>` +
    `<Orders>${ordersXml}</Orders>` +
    `</AuditExport>`
  );
}
