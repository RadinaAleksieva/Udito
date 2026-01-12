import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import path from "path";

// Register fonts
const fontPath = path.join(process.cwd(), "public/fonts");

Font.register({
  family: "Roboto",
  fonts: [
    { src: `${fontPath}/Roboto-Regular.ttf`, fontWeight: 400 },
    { src: `${fontPath}/Roboto-Bold.ttf`, fontWeight: 700 },
  ],
});

Font.register({
  family: "RobotoMono",
  fonts: [
    { src: `${fontPath}/RobotoMono-Regular.ttf`, fontWeight: 400 },
    { src: `${fontPath}/RobotoMono-Bold.ttf`, fontWeight: 700 },
  ],
});

// Official EUR/BGN conversion rate
const BGN_TO_EUR = 0.51129;

function formatMoney(amount: number | null | undefined, currency: string): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function convertToEur(amount: number): number {
  return amount * BGN_TO_EUR;
}

// Accent color hex values
const ACCENT_COLORS: Record<string, string> = {
  green: "#059669",
  blue: "#2563eb",
  orange: "#ea580c",
  pink: "#db2777",
  yellow: "#ca8a04",
  purple: "#7c3aed",
};

// Pastel gradient colors for Playful template (Revolut-style)
const PLAYFUL_GRADIENTS: Record<string, { bg: string; accent: string; light: string }> = {
  green: { bg: "#e6f7f2", accent: "#10b981", light: "#d1fae5" },
  blue: { bg: "#e0f2fe", accent: "#3b82f6", light: "#dbeafe" },
  orange: { bg: "#fff7ed", accent: "#f97316", light: "#ffedd5" },
  pink: { bg: "#fdf2f8", accent: "#ec4899", light: "#fce7f3" },
  yellow: { bg: "#fefce8", accent: "#eab308", light: "#fef9c3" },
  purple: { bg: "#f3e8ff", accent: "#a855f7", light: "#e9d5ff" },
};

export type ReceiptPdfData = {
  // Receipt info
  receiptNumber: string;
  receiptType: "sale" | "refund";
  referenceReceiptId?: number | null;
  issuedDate: string;
  orderNumber: string;
  transactionCode: string;

  // Company info
  storeName: string;
  legalName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  country: string;
  bulstat: string;
  vatNumber: string;
  contactEmail: string;
  contactPhone: string;
  logoUrl?: string;
  logoWidth?: number | null;
  logoHeight?: number | null;

  // Customer info
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  shippingLine1: string;
  shippingLine2?: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingCountry: string;
  shippingMethod: string;

  // Items
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    taxPercent: number;
    lineTotal: number;
  }>;

  // Totals
  subtotal: number;
  discountAmount?: number;
  discountCode?: string;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  currency: string;

  // Payment
  paymentLabel: string;
  paymentDate: string;

  // QR
  qrDataUrl?: string;

  // EUR display (for 2026+)
  showEurPrimary?: boolean;
  isPartialRefund?: boolean;

  // Template settings
  receiptTemplate?: "classic" | "modern" | "dark" | "playful";
  accentColor?: string;
};

// Helper to get logo dimensions
function getLogoStyle(logoWidth?: number | null, logoHeight?: number | null, maxH = 70, maxW = 140) {
  if (logoWidth && logoHeight) {
    const aspectRatio = logoWidth / logoHeight;
    let width, height;
    height = maxH;
    width = maxH * aspectRatio;
    if (width > maxW) {
      width = maxW;
      height = maxW / aspectRatio;
    }
    return { width, height };
  }
  return { width: 80 };
}

// ============================================
// MODERN TEMPLATE (Default)
// ============================================
const modernStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Roboto",
    fontSize: 10,
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    marginBottom: 16,
  },
  logoBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  logoFallback: {
    fontSize: 14,
    fontWeight: 700,
  },
  receiptMeta: {
    textAlign: "right",
    width: 240,
  },
  receiptTitle: {
    fontSize: 14,
    marginBottom: 6,
  },
  receiptTitleBold: {
    fontWeight: 700,
  },
  refundTitle: {
    color: "#dc2626",
  },
  metaText: {
    fontSize: 9,
    color: "#6b6b6b",
    marginBottom: 2,
  },
  metaBold: {
    fontWeight: 700,
    color: "#1a1a1a",
  },
  transactionCode: {
    fontSize: 8,
    fontWeight: 700,
    marginTop: 2,
  },
  refundReference: {
    fontSize: 9,
    color: "#dc2626",
    marginTop: 2,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 30,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  infoColumn: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#6b6b6b",
    marginBottom: 8,
  },
  shopName: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 9,
    color: "#6b6b6b",
    marginBottom: 2,
  },
  itemsSection: {
    marginBottom: 16,
  },
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    paddingBottom: 8,
    marginBottom: 4,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#6b6b6b",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  tableCell: {
    fontSize: 9,
  },
  colName: { width: "40%" },
  colQty: { width: "10%", textAlign: "right" },
  colPrice: { width: "16%", textAlign: "right" },
  colTax: { width: "14%", textAlign: "right" },
  colTotal: { width: "20%", textAlign: "right" },
  totalsSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  totalsBox: {
    width: 220,
    padding: 12,
    borderRadius: 6,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  totalLabel: {
    fontSize: 9,
  },
  totalValue: {
    fontSize: 9,
    fontWeight: 700,
  },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    paddingTop: 6,
    marginTop: 4,
  },
  totalLabelFinal: {
    fontSize: 10,
    fontWeight: 700,
  },
  totalValueFinal: {
    fontSize: 10,
    fontWeight: 700,
  },
  discountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  discountValue: {
    fontSize: 9,
    fontWeight: 700,
    color: "#059669",
  },
  paymentSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  paymentRow: {
    flexDirection: "row",
    gap: 20,
  },
  paymentText: {
    fontSize: 9,
    color: "#6b6b6b",
  },
  legalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  contactBlock: {},
  contactLabel: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#6b6b6b",
    marginBottom: 4,
  },
  contactText: {
    fontSize: 9,
    marginBottom: 2,
  },
  qrBlock: {
    alignItems: "flex-end",
  },
  qrImage: {
    width: 80,
    height: 80,
  },
  qrMissing: {
    fontSize: 8,
    color: "#6b6b6b",
    textAlign: "right",
    maxWidth: 100,
  },
  negativeAmount: {
    color: "#dc2626",
  },
});

function ModernTemplate({ data }: { data: ReceiptPdfData }) {
  const isRefund = data.receiptType === "refund";
  const showEur = data.showEurPrimary && data.currency === "BGN";
  const accentHex = ACCENT_COLORS[data.accentColor || "green"] || ACCENT_COLORS.green;

  const formatAmount = (amount: number) => {
    if (showEur) {
      return `${formatMoney(convertToEur(amount), "EUR")} / ${formatMoney(amount, data.currency)}`;
    }
    return formatMoney(amount, data.currency);
  };

  const formatPrice = (amount: number) => {
    if (showEur) return formatMoney(convertToEur(amount), "EUR");
    return formatMoney(amount, data.currency);
  };

  // Calculate price without VAT for each item
  const getNetPrice = (unitPrice: number, taxPercent: number) => {
    return unitPrice / (1 + taxPercent / 100);
  };

  const getVatAmount = (lineTotal: number, taxPercent: number) => {
    return lineTotal - lineTotal / (1 + taxPercent / 100);
  };

  return (
    <Document>
      <Page size="A4" style={modernStyles.page}>
        {/* Header */}
        <View style={modernStyles.header}>
          <View style={modernStyles.logoBlock}>
            {data.logoUrl ? (
              <Image src={data.logoUrl} style={getLogoStyle(data.logoWidth, data.logoHeight)} />
            ) : (
              <Text style={modernStyles.logoFallback}>{data.storeName}</Text>
            )}
          </View>
          <View style={modernStyles.receiptMeta}>
            <Text style={isRefund ? [modernStyles.receiptTitle, modernStyles.refundTitle] : modernStyles.receiptTitle}>
              {isRefund ? "СТОРНО бележка " : "Бележка "}
              <Text style={modernStyles.receiptTitleBold}>{data.receiptNumber}</Text>
            </Text>
            {isRefund && data.referenceReceiptId && (
              <Text style={modernStyles.refundReference}>към бележка #{data.referenceReceiptId}</Text>
            )}
            <Text style={modernStyles.metaText}>
              Дата и час: <Text style={modernStyles.metaBold}>{data.issuedDate}</Text>
            </Text>
            <Text style={modernStyles.metaText}>
              Поръчка: <Text style={modernStyles.metaBold}>{data.orderNumber}</Text>
            </Text>
            <Text style={modernStyles.metaText}>Уникален код:</Text>
            <Text style={modernStyles.transactionCode}>{data.transactionCode}</Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={modernStyles.infoGrid}>
          <View style={modernStyles.infoColumn}>
            <Text style={modernStyles.sectionTitle}>Търговец</Text>
            <Text style={modernStyles.shopName}>{data.storeName}</Text>
            <Text style={modernStyles.infoText}>{data.legalName}</Text>
            <Text style={modernStyles.infoText}>{data.addressLine1}</Text>
            {data.addressLine2 && <Text style={modernStyles.infoText}>{data.addressLine2}</Text>}
            <Text style={modernStyles.infoText}>{data.postalCode} {data.city}</Text>
            <Text style={modernStyles.infoText}>{data.country}</Text>
            <Text style={modernStyles.infoText}>ЕИК: {data.bulstat}</Text>
            {data.vatNumber && <Text style={modernStyles.infoText}>ДДС №: {data.vatNumber}</Text>}
          </View>
          <View style={modernStyles.infoColumn}>
            <Text style={modernStyles.sectionTitle}>Клиент</Text>
            <Text style={modernStyles.shopName}>{data.customerName}</Text>
            <Text style={modernStyles.infoText}>{data.shippingLine1}</Text>
            {data.shippingLine2 && <Text style={modernStyles.infoText}>{data.shippingLine2}</Text>}
            <Text style={modernStyles.infoText}>{data.shippingPostalCode} {data.shippingCity}</Text>
            <Text style={modernStyles.infoText}>{data.shippingCountry || "България"}</Text>
            <Text style={modernStyles.infoText}>{data.customerEmail}</Text>
            {data.customerPhone && <Text style={modernStyles.infoText}>{data.customerPhone}</Text>}
            <Text style={modernStyles.infoText}>Доставка: {data.shippingMethod}</Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={modernStyles.itemsSection}>
          <Text style={modernStyles.sectionTitle}>Артикули</Text>
          <View style={modernStyles.table}>
            <View style={modernStyles.tableHeader}>
              <Text style={[modernStyles.tableHeaderCell, modernStyles.colName]}>Артикул</Text>
              <Text style={[modernStyles.tableHeaderCell, modernStyles.colQty]}>Кол.</Text>
              <Text style={[modernStyles.tableHeaderCell, modernStyles.colPrice]}>Цена без ДДС</Text>
              <Text style={[modernStyles.tableHeaderCell, modernStyles.colTax]}>ДДС</Text>
              <Text style={[modernStyles.tableHeaderCell, modernStyles.colTotal]}>Общо</Text>
            </View>
            {data.items.map((item, idx) => {
              const netPrice = getNetPrice(item.unitPrice, item.taxPercent);
              const vatAmount = getVatAmount(item.lineTotal, item.taxPercent);
              return (
                <View style={modernStyles.tableRow} key={idx}>
                  <Text style={[modernStyles.tableCell, modernStyles.colName]}>{item.name}</Text>
                  <Text style={[modernStyles.tableCell, modernStyles.colQty]}>
                    {isRefund ? -item.quantity : item.quantity}
                  </Text>
                  <Text style={[modernStyles.tableCell, modernStyles.colPrice]}>
                    {formatPrice(netPrice)}
                  </Text>
                  <Text style={[modernStyles.tableCell, modernStyles.colTax]}>
                    {formatPrice(isRefund ? -vatAmount : vatAmount)}
                  </Text>
                  <Text style={isRefund ? [modernStyles.tableCell, modernStyles.colTotal, modernStyles.negativeAmount] : [modernStyles.tableCell, modernStyles.colTotal]}>
                    {formatPrice(isRefund ? -item.lineTotal : item.lineTotal)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Totals */}
        <View style={modernStyles.totalsSection}>
          <View style={[modernStyles.totalsBox, { backgroundColor: `${accentHex}15` }]}>
            <View style={modernStyles.totalRow}>
              <Text style={modernStyles.totalLabel}>Междинна сума</Text>
              <Text style={modernStyles.totalValue}>{formatAmount(data.subtotal)}</Text>
            </View>
            {data.discountAmount && data.discountAmount > 0 && !isRefund && (
              <View style={modernStyles.discountRow}>
                <Text style={modernStyles.totalLabel}>
                  Отстъпка{data.discountCode ? ` (${data.discountCode})` : ""}
                </Text>
                <Text style={modernStyles.discountValue}>-{formatAmount(data.discountAmount)}</Text>
              </View>
            )}
            {!data.isPartialRefund && (
              <View style={modernStyles.totalRow}>
                <Text style={modernStyles.totalLabel}>Доставка</Text>
                <Text style={modernStyles.totalValue}>{formatAmount(data.shippingTotal)}</Text>
              </View>
            )}
            <View style={modernStyles.totalRow}>
              <Text style={modernStyles.totalLabel}>ДДС (20%)</Text>
              <Text style={modernStyles.totalValue}>{formatAmount(data.taxTotal)}</Text>
            </View>
            <View style={modernStyles.totalRowFinal}>
              <Text style={modernStyles.totalLabelFinal}>Обща сума</Text>
              <Text style={isRefund ? [modernStyles.totalValueFinal, modernStyles.negativeAmount, { color: "#dc2626" }] : [modernStyles.totalValueFinal, { color: accentHex }]}>
                {formatAmount(data.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment */}
        <View style={modernStyles.paymentSection}>
          <Text style={modernStyles.sectionTitle}>Плащане</Text>
          <View style={modernStyles.paymentRow}>
            <Text style={modernStyles.paymentText}>{data.paymentDate}</Text>
            <Text style={modernStyles.paymentText}>{data.paymentLabel}</Text>
            <Text style={isRefund ? [modernStyles.paymentText, modernStyles.negativeAmount] : modernStyles.paymentText}>
              {formatAmount(data.total)}
            </Text>
          </View>
        </View>

        {/* Contact / QR */}
        <View style={modernStyles.legalSection}>
          <View style={modernStyles.contactBlock}>
            <Text style={modernStyles.contactLabel}>Контакт</Text>
            <Text style={modernStyles.contactText}>{data.contactEmail}</Text>
            <Text style={modernStyles.contactText}>{data.contactPhone}</Text>
          </View>
          <View style={modernStyles.qrBlock}>
            {data.qrDataUrl ? (
              <Image src={data.qrDataUrl} style={modernStyles.qrImage} />
            ) : (
              <Text style={modernStyles.qrMissing}>Липсва QR код</Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ============================================
// CLASSIC TEMPLATE (Thermal Receipt Style)
// ============================================
const classicStyles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: "RobotoMono",
    fontSize: 9,
    color: "#000000",
    backgroundColor: "#ffffff",
  },
  header: {
    textAlign: "center",
    marginBottom: 10,
  },
  logoWrapper: {
    alignItems: "center",
    marginBottom: 8,
  },
  storeName: {
    fontSize: 12,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 4,
  },
  companyInfo: {
    textAlign: "center",
    fontSize: 8,
    marginBottom: 2,
  },
  divider: {
    textAlign: "center",
    fontSize: 8,
    marginVertical: 6,
    letterSpacing: 2,
  },
  receiptInfo: {
    textAlign: "center",
    marginBottom: 10,
  },
  receiptNumber: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
  },
  refundBadge: {
    color: "#dc2626",
  },
  infoLine: {
    fontSize: 8,
    marginBottom: 2,
  },
  transactionCode: {
    fontSize: 7,
    marginTop: 4,
  },
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 8,
    fontWeight: 700,
    textAlign: "center",
    marginBottom: 6,
  },
  customerInfo: {
    fontSize: 8,
    textAlign: "center",
    marginBottom: 2,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
    fontSize: 8,
  },
  itemName: {
    flex: 1,
    fontSize: 8,
  },
  itemDetails: {
    fontSize: 7,
    color: "#666",
    marginBottom: 4,
    marginLeft: 10,
  },
  totalSection: {
    marginTop: 6,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
    fontSize: 8,
  },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopStyle: "dashed",
    borderTopColor: "#000",
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: 700,
  },
  totalValue: {
    fontSize: 10,
    fontWeight: 700,
  },
  negativeAmount: {
    color: "#dc2626",
  },
  paymentInfo: {
    textAlign: "center",
    fontSize: 8,
    marginBottom: 2,
  },
  qrSection: {
    alignItems: "center",
    marginTop: 10,
  },
  qrImage: {
    width: 70,
    height: 70,
  },
  footer: {
    textAlign: "center",
    fontSize: 7,
    marginTop: 10,
    color: "#666",
  },
});

function ClassicTemplate({ data }: { data: ReceiptPdfData }) {
  const isRefund = data.receiptType === "refund";
  const showEur = data.showEurPrimary && data.currency === "BGN";

  const formatAmount = (amount: number) => {
    if (showEur) {
      return `${formatMoney(convertToEur(amount), "EUR")}`;
    }
    return formatMoney(amount, data.currency);
  };

  const getNetPrice = (unitPrice: number, taxPercent: number) => {
    return unitPrice / (1 + taxPercent / 100);
  };

  const getVatAmount = (lineTotal: number, taxPercent: number) => {
    return lineTotal - lineTotal / (1 + taxPercent / 100);
  };

  const dottedLine = "- - - - - - - - - - - - - - - - - - - - -";

  return (
    <Document>
      <Page size="A4" style={classicStyles.page}>
        {/* Header */}
        <View style={classicStyles.header}>
          {data.logoUrl ? (
            <View style={classicStyles.logoWrapper}>
              <Image src={data.logoUrl} style={getLogoStyle(data.logoWidth, data.logoHeight, 55, 110)} />
            </View>
          ) : (
            <Text style={classicStyles.storeName}>{data.storeName}</Text>
          )}
          <Text style={classicStyles.companyInfo}>{data.legalName}</Text>
          <Text style={classicStyles.companyInfo}>{data.addressLine1}</Text>
          <Text style={classicStyles.companyInfo}>{data.postalCode} {data.city}</Text>
          <Text style={classicStyles.companyInfo}>ЕИК: {data.bulstat}</Text>
          {data.vatNumber && <Text style={classicStyles.companyInfo}>ДДС: {data.vatNumber}</Text>}
        </View>

        <Text style={classicStyles.divider}>{dottedLine}</Text>

        {/* Receipt Info */}
        <View style={classicStyles.receiptInfo}>
          <Text style={isRefund ? [classicStyles.receiptNumber, classicStyles.refundBadge] : classicStyles.receiptNumber}>
            {isRefund ? "СТОРНО " : ""}№ {data.receiptNumber}
          </Text>
          {isRefund && data.referenceReceiptId && (
            <Text style={[classicStyles.infoLine, classicStyles.refundBadge]}>
              към бележка #{data.referenceReceiptId}
            </Text>
          )}
          <Text style={classicStyles.infoLine}>Дата: {data.issuedDate}</Text>
          <Text style={classicStyles.infoLine}>Поръчка: {data.orderNumber}</Text>
          <Text style={classicStyles.transactionCode}>Код: {data.transactionCode}</Text>
        </View>

        <Text style={classicStyles.divider}>{dottedLine}</Text>

        {/* Customer */}
        <View style={classicStyles.section}>
          <Text style={classicStyles.sectionTitle}>КЛИЕНТ</Text>
          <Text style={classicStyles.customerInfo}>{data.customerName}</Text>
          <Text style={classicStyles.customerInfo}>{data.shippingLine1}</Text>
          <Text style={classicStyles.customerInfo}>{data.shippingPostalCode} {data.shippingCity}</Text>
          <Text style={classicStyles.customerInfo}>{data.customerEmail}</Text>
        </View>

        <Text style={classicStyles.divider}>{dottedLine}</Text>

        {/* Items */}
        <View style={classicStyles.section}>
          <Text style={classicStyles.sectionTitle}>АРТИКУЛИ</Text>
          {data.items.map((item, idx) => {
            const netPrice = getNetPrice(item.unitPrice, item.taxPercent);
            const vatAmount = getVatAmount(item.lineTotal, item.taxPercent);
            const qty = isRefund ? -item.quantity : item.quantity;
            const total = isRefund ? -item.lineTotal : item.lineTotal;
            return (
              <View key={idx}>
                <View style={classicStyles.itemRow}>
                  <Text style={classicStyles.itemName}>{item.name}</Text>
                  <Text>{formatAmount(total)}</Text>
                </View>
                <Text style={classicStyles.itemDetails}>
                  {qty} x {formatAmount(netPrice)} + ДДС {formatAmount(vatAmount)}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={classicStyles.divider}>{dottedLine}</Text>

        {/* Totals */}
        <View style={classicStyles.totalSection}>
          <View style={classicStyles.totalRow}>
            <Text>Междинна сума</Text>
            <Text>{formatAmount(data.subtotal)}</Text>
          </View>
          {data.discountAmount && data.discountAmount > 0 && !isRefund && (
            <View style={classicStyles.totalRow}>
              <Text>Отстъпка{data.discountCode ? ` (${data.discountCode})` : ""}</Text>
              <Text>-{formatAmount(data.discountAmount)}</Text>
            </View>
          )}
          {!data.isPartialRefund && (
            <View style={classicStyles.totalRow}>
              <Text>Доставка</Text>
              <Text>{formatAmount(data.shippingTotal)}</Text>
            </View>
          )}
          <View style={classicStyles.totalRow}>
            <Text>ДДС (20%)</Text>
            <Text>{formatAmount(data.taxTotal)}</Text>
          </View>
          <View style={classicStyles.totalRowFinal}>
            <Text style={classicStyles.totalLabel}>ОБЩО</Text>
            <Text style={isRefund ? [classicStyles.totalValue, classicStyles.negativeAmount] : classicStyles.totalValue}>
              {formatAmount(data.total)}
            </Text>
          </View>
        </View>

        <Text style={classicStyles.divider}>{dottedLine}</Text>

        {/* Payment */}
        <View style={classicStyles.section}>
          <Text style={classicStyles.paymentInfo}>{data.paymentLabel}</Text>
          <Text style={classicStyles.paymentInfo}>{data.paymentDate}</Text>
        </View>

        {/* QR */}
        {data.qrDataUrl && (
          <View style={classicStyles.qrSection}>
            <Image src={data.qrDataUrl} style={classicStyles.qrImage} />
          </View>
        )}

        {/* Footer */}
        <View style={classicStyles.footer}>
          <Text>{data.contactEmail}</Text>
          <Text>{data.contactPhone}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ============================================
// DARK TEMPLATE
// ============================================
const darkStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Roboto",
    fontSize: 10,
    color: "#f5f5f5",
    backgroundColor: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    marginBottom: 20,
  },
  logoBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  logoFallback: {
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
  },
  receiptMeta: {
    textAlign: "right",
    width: 240,
  },
  receiptTitle: {
    fontSize: 14,
    marginBottom: 6,
    color: "#fff",
  },
  receiptTitleBold: {
    fontWeight: 700,
  },
  refundTitle: {
    color: "#f87171",
  },
  metaText: {
    fontSize: 9,
    color: "#a3a3a3",
    marginBottom: 2,
  },
  metaBold: {
    fontWeight: 700,
    color: "#fff",
  },
  transactionCode: {
    fontSize: 8,
    fontWeight: 700,
    marginTop: 2,
    color: "#a3a3a3",
  },
  refundReference: {
    fontSize: 9,
    color: "#f87171",
    marginTop: 2,
  },
  infoGrid: {
    flexDirection: "row",
    gap: 30,
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  infoColumn: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#10b981",
    marginBottom: 10,
  },
  shopName: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 4,
    color: "#fff",
  },
  infoText: {
    fontSize: 9,
    color: "#a3a3a3",
    marginBottom: 2,
  },
  itemsSection: {
    marginBottom: 20,
  },
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 10,
    marginBottom: 4,
  },
  tableHeaderCell: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#10b981",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  tableCell: {
    fontSize: 9,
    color: "#f5f5f5",
  },
  colName: { width: "40%" },
  colQty: { width: "10%", textAlign: "right" },
  colPrice: { width: "16%", textAlign: "right" },
  colTax: { width: "14%", textAlign: "right" },
  colTotal: { width: "20%", textAlign: "right" },
  totalsSection: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  totalsBox: {
    width: 220,
    backgroundColor: "#262626",
    padding: 14,
    borderRadius: 8,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  totalLabel: {
    fontSize: 9,
    color: "#a3a3a3",
  },
  totalValue: {
    fontSize: 9,
    fontWeight: 700,
    color: "#fff",
  },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#404040",
    paddingTop: 8,
    marginTop: 6,
  },
  totalLabelFinal: {
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
  },
  totalValueFinal: {
    fontSize: 11,
    fontWeight: 700,
    color: "#10b981",
  },
  discountValue: {
    fontSize: 9,
    fontWeight: 700,
    color: "#10b981",
  },
  paymentSection: {
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  paymentRow: {
    flexDirection: "row",
    gap: 20,
  },
  paymentText: {
    fontSize: 9,
    color: "#a3a3a3",
  },
  legalSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  contactBlock: {},
  contactLabel: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#10b981",
    marginBottom: 6,
  },
  contactText: {
    fontSize: 9,
    marginBottom: 2,
    color: "#a3a3a3",
  },
  qrBlock: {
    alignItems: "flex-end",
  },
  qrImage: {
    width: 80,
    height: 80,
  },
  qrMissing: {
    fontSize: 8,
    color: "#666",
    textAlign: "right",
    maxWidth: 100,
  },
  negativeAmount: {
    color: "#f87171",
  },
});

function DarkTemplate({ data }: { data: ReceiptPdfData }) {
  const isRefund = data.receiptType === "refund";
  const showEur = data.showEurPrimary && data.currency === "BGN";

  const formatAmount = (amount: number) => {
    if (showEur) {
      return `${formatMoney(convertToEur(amount), "EUR")} / ${formatMoney(amount, data.currency)}`;
    }
    return formatMoney(amount, data.currency);
  };

  const formatPrice = (amount: number) => {
    if (showEur) return formatMoney(convertToEur(amount), "EUR");
    return formatMoney(amount, data.currency);
  };

  const getNetPrice = (unitPrice: number, taxPercent: number) => {
    return unitPrice / (1 + taxPercent / 100);
  };

  const getVatAmount = (lineTotal: number, taxPercent: number) => {
    return lineTotal - lineTotal / (1 + taxPercent / 100);
  };

  return (
    <Document>
      <Page size="A4" style={darkStyles.page}>
        {/* Header */}
        <View style={darkStyles.header}>
          <View style={darkStyles.logoBlock}>
            {data.logoUrl ? (
              <Image src={data.logoUrl} style={getLogoStyle(data.logoWidth, data.logoHeight)} />
            ) : (
              <Text style={darkStyles.logoFallback}>{data.storeName}</Text>
            )}
          </View>
          <View style={darkStyles.receiptMeta}>
            <Text style={isRefund ? [darkStyles.receiptTitle, darkStyles.refundTitle] : darkStyles.receiptTitle}>
              {isRefund ? "СТОРНО " : ""}Бележка <Text style={darkStyles.receiptTitleBold}>{data.receiptNumber}</Text>
            </Text>
            {isRefund && data.referenceReceiptId && (
              <Text style={darkStyles.refundReference}>към бележка #{data.referenceReceiptId}</Text>
            )}
            <Text style={darkStyles.metaText}>
              Дата: <Text style={darkStyles.metaBold}>{data.issuedDate}</Text>
            </Text>
            <Text style={darkStyles.metaText}>
              Поръчка: <Text style={darkStyles.metaBold}>{data.orderNumber}</Text>
            </Text>
            <Text style={darkStyles.transactionCode}>Код: {data.transactionCode}</Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={darkStyles.infoGrid}>
          <View style={darkStyles.infoColumn}>
            <Text style={darkStyles.sectionTitle}>Търговец</Text>
            <Text style={darkStyles.shopName}>{data.storeName}</Text>
            <Text style={darkStyles.infoText}>{data.legalName}</Text>
            <Text style={darkStyles.infoText}>{data.addressLine1}</Text>
            <Text style={darkStyles.infoText}>{data.postalCode} {data.city}</Text>
            <Text style={darkStyles.infoText}>ЕИК: {data.bulstat}</Text>
            {data.vatNumber && <Text style={darkStyles.infoText}>ДДС: {data.vatNumber}</Text>}
          </View>
          <View style={darkStyles.infoColumn}>
            <Text style={darkStyles.sectionTitle}>Клиент</Text>
            <Text style={darkStyles.shopName}>{data.customerName}</Text>
            <Text style={darkStyles.infoText}>{data.shippingLine1}</Text>
            <Text style={darkStyles.infoText}>{data.shippingPostalCode} {data.shippingCity}</Text>
            <Text style={darkStyles.infoText}>{data.customerEmail}</Text>
            {data.customerPhone && <Text style={darkStyles.infoText}>{data.customerPhone}</Text>}
          </View>
        </View>

        {/* Items */}
        <View style={darkStyles.itemsSection}>
          <Text style={darkStyles.sectionTitle}>Артикули</Text>
          <View style={darkStyles.table}>
            <View style={darkStyles.tableHeader}>
              <Text style={[darkStyles.tableHeaderCell, darkStyles.colName]}>Артикул</Text>
              <Text style={[darkStyles.tableHeaderCell, darkStyles.colQty]}>Кол.</Text>
              <Text style={[darkStyles.tableHeaderCell, darkStyles.colPrice]}>Цена без ДДС</Text>
              <Text style={[darkStyles.tableHeaderCell, darkStyles.colTax]}>ДДС</Text>
              <Text style={[darkStyles.tableHeaderCell, darkStyles.colTotal]}>Общо</Text>
            </View>
            {data.items.map((item, idx) => {
              const netPrice = getNetPrice(item.unitPrice, item.taxPercent);
              const vatAmount = getVatAmount(item.lineTotal, item.taxPercent);
              return (
                <View style={darkStyles.tableRow} key={idx}>
                  <Text style={[darkStyles.tableCell, darkStyles.colName]}>{item.name}</Text>
                  <Text style={[darkStyles.tableCell, darkStyles.colQty]}>
                    {isRefund ? -item.quantity : item.quantity}
                  </Text>
                  <Text style={[darkStyles.tableCell, darkStyles.colPrice]}>{formatPrice(netPrice)}</Text>
                  <Text style={[darkStyles.tableCell, darkStyles.colTax]}>{formatPrice(isRefund ? -vatAmount : vatAmount)}</Text>
                  <Text style={isRefund ? [darkStyles.tableCell, darkStyles.colTotal, darkStyles.negativeAmount] : [darkStyles.tableCell, darkStyles.colTotal]}>
                    {formatPrice(isRefund ? -item.lineTotal : item.lineTotal)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Totals */}
        <View style={darkStyles.totalsSection}>
          <View style={darkStyles.totalsBox}>
            <View style={darkStyles.totalRow}>
              <Text style={darkStyles.totalLabel}>Междинна сума</Text>
              <Text style={darkStyles.totalValue}>{formatAmount(data.subtotal)}</Text>
            </View>
            {data.discountAmount && data.discountAmount > 0 && !isRefund && (
              <View style={darkStyles.totalRow}>
                <Text style={darkStyles.totalLabel}>Отстъпка</Text>
                <Text style={darkStyles.discountValue}>-{formatAmount(data.discountAmount)}</Text>
              </View>
            )}
            {!data.isPartialRefund && (
              <View style={darkStyles.totalRow}>
                <Text style={darkStyles.totalLabel}>Доставка</Text>
                <Text style={darkStyles.totalValue}>{formatAmount(data.shippingTotal)}</Text>
              </View>
            )}
            <View style={darkStyles.totalRow}>
              <Text style={darkStyles.totalLabel}>ДДС (20%)</Text>
              <Text style={darkStyles.totalValue}>{formatAmount(data.taxTotal)}</Text>
            </View>
            <View style={darkStyles.totalRowFinal}>
              <Text style={darkStyles.totalLabelFinal}>Обща сума</Text>
              <Text style={isRefund ? [darkStyles.totalValueFinal, darkStyles.negativeAmount] : darkStyles.totalValueFinal}>
                {formatAmount(data.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment */}
        <View style={darkStyles.paymentSection}>
          <Text style={darkStyles.sectionTitle}>Плащане</Text>
          <View style={darkStyles.paymentRow}>
            <Text style={darkStyles.paymentText}>{data.paymentDate}</Text>
            <Text style={darkStyles.paymentText}>{data.paymentLabel}</Text>
            <Text style={isRefund ? [darkStyles.paymentText, darkStyles.negativeAmount] : darkStyles.paymentText}>
              {formatAmount(data.total)}
            </Text>
          </View>
        </View>

        {/* Contact / QR */}
        <View style={darkStyles.legalSection}>
          <View style={darkStyles.contactBlock}>
            <Text style={darkStyles.contactLabel}>Контакт</Text>
            <Text style={darkStyles.contactText}>{data.contactEmail}</Text>
            <Text style={darkStyles.contactText}>{data.contactPhone}</Text>
          </View>
          <View style={darkStyles.qrBlock}>
            {data.qrDataUrl ? (
              <Image src={data.qrDataUrl} style={darkStyles.qrImage} />
            ) : (
              <Text style={darkStyles.qrMissing}>Липсва QR код</Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ============================================
// PLAYFUL TEMPLATE (Revolut-style gradient)
// ============================================
const playfulStyles = StyleSheet.create({
  page: {
    padding: 0,
    fontFamily: "Roboto",
    fontSize: 10,
    color: "#1a1a1a",
  },
  // Full page gradient background simulation
  gradientTop: {
    padding: 30,
    paddingBottom: 20,
  },
  gradientBottom: {
    padding: 30,
    paddingTop: 20,
    flexGrow: 1,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  logoBlock: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoFallback: {
    fontSize: 20,
    fontWeight: 700,
  },
  headerRight: {
    alignItems: "flex-end",
  },
  receiptBadge: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginBottom: 8,
  },
  receiptBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
  },
  metaText: {
    fontSize: 9,
    marginBottom: 2,
  },
  // Big amount display (Revolut-style)
  amountSection: {
    alignItems: "center",
    marginBottom: 30,
    paddingVertical: 20,
  },
  amountLabel: {
    fontSize: 11,
    marginBottom: 6,
  },
  amountValue: {
    fontSize: 42,
    fontWeight: 700,
  },
  amountSubtext: {
    fontSize: 10,
    marginTop: 8,
  },
  // Info cards
  infoCards: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  infoCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    padding: 14,
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  cardName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
    color: "#1a1a1a",
  },
  cardText: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 2,
  },
  // Items
  itemsSection: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
    color: "#6b7280",
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  itemLeft: {
    flex: 1,
  },
  itemName: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 2,
    color: "#1a1a1a",
  },
  itemDetails: {
    fontSize: 8,
    color: "#9ca3af",
  },
  itemPrice: {
    fontSize: 11,
    fontWeight: 700,
    color: "#1a1a1a",
  },
  // Totals
  totalsSection: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  totalLabel: {
    fontSize: 10,
    color: "#6b7280",
  },
  totalValue: {
    fontSize: 10,
    fontWeight: 700,
    color: "#1a1a1a",
  },
  totalRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
    marginTop: 6,
  },
  totalLabelFinal: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1a1a1a",
  },
  totalValueFinal: {
    fontSize: 14,
    fontWeight: 700,
  },
  // Payment badge
  paymentBadge: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginBottom: 20,
  },
  paymentText: {
    fontSize: 11,
    color: "#fff",
    fontWeight: 700,
  },
  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: "auto",
  },
  contactBlock: {},
  contactText: {
    fontSize: 9,
    marginBottom: 2,
  },
  qrBlock: {
    alignItems: "flex-end",
    backgroundColor: "#ffffff",
    padding: 10,
    borderRadius: 12,
  },
  qrImage: {
    width: 65,
    height: 65,
  },
  transactionCode: {
    fontSize: 7,
    marginTop: 4,
    textAlign: "right",
  },
  negativeAmount: {
    color: "#dc2626",
  },
  refundBanner: {
    backgroundColor: "#fef2f2",
    padding: 10,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: "center",
  },
  refundText: {
    color: "#dc2626",
    fontSize: 10,
    fontWeight: 700,
  },
});

function PlayfulTemplate({ data }: { data: ReceiptPdfData }) {
  const isRefund = data.receiptType === "refund";
  const showEur = data.showEurPrimary && data.currency === "BGN";
  const colorKey = data.accentColor || "purple";
  const gradient = PLAYFUL_GRADIENTS[colorKey] || PLAYFUL_GRADIENTS.purple;

  const formatAmount = (amount: number) => {
    if (showEur) {
      return `${formatMoney(convertToEur(amount), "EUR")}`;
    }
    return formatMoney(amount, data.currency);
  };

  const getNetPrice = (unitPrice: number, taxPercent: number) => {
    return unitPrice / (1 + taxPercent / 100);
  };

  const getVatAmount = (lineTotal: number, taxPercent: number) => {
    return lineTotal - lineTotal / (1 + taxPercent / 100);
  };

  return (
    <Document>
      <Page size="A4" style={[playfulStyles.page, { backgroundColor: gradient.bg }]}>
        {/* Top gradient section */}
        <View style={[playfulStyles.gradientTop, { backgroundColor: gradient.light }]}>
          {/* Header */}
          <View style={playfulStyles.header}>
            <View style={playfulStyles.logoBlock}>
              {data.logoUrl ? (
                <Image src={data.logoUrl} style={getLogoStyle(data.logoWidth, data.logoHeight, 70, 140)} />
              ) : (
                <Text style={[playfulStyles.logoFallback, { color: gradient.accent }]}>{data.storeName}</Text>
              )}
            </View>
            <View style={playfulStyles.headerRight}>
              <View style={[playfulStyles.receiptBadge, { backgroundColor: gradient.accent }]}>
                <Text style={playfulStyles.receiptBadgeText}>
                  {isRefund ? "СТОРНО" : "БЕЛЕЖКА"} #{data.receiptNumber}
                </Text>
              </View>
              <Text style={[playfulStyles.metaText, { color: gradient.accent }]}>{data.issuedDate}</Text>
              <Text style={[playfulStyles.metaText, { color: gradient.accent }]}>Поръчка: {data.orderNumber}</Text>
            </View>
          </View>

          {/* Big Amount Display (Revolut-style) */}
          <View style={playfulStyles.amountSection}>
            <Text style={[playfulStyles.amountLabel, { color: gradient.accent }]}>
              {isRefund ? "Възстановена сума" : "Обща сума"}
            </Text>
            <Text style={[playfulStyles.amountValue, { color: gradient.accent }]}>
              {formatAmount(Math.abs(data.total))}
            </Text>
            <Text style={[playfulStyles.amountSubtext, { color: gradient.accent }]}>
              {data.paymentLabel}
            </Text>
          </View>

          {/* Refund Banner */}
          {isRefund && data.referenceReceiptId && (
            <View style={playfulStyles.refundBanner}>
              <Text style={playfulStyles.refundText}>Сторно към бележка #{data.referenceReceiptId}</Text>
            </View>
          )}
        </View>

        {/* Bottom content section */}
        <View style={[playfulStyles.gradientBottom, { backgroundColor: gradient.bg }]}>
          {/* Info Cards */}
          <View style={playfulStyles.infoCards}>
            <View style={playfulStyles.infoCard}>
              <Text style={[playfulStyles.cardTitle, { color: gradient.accent }]}>Търговец</Text>
              <Text style={playfulStyles.cardName}>{data.storeName}</Text>
              <Text style={playfulStyles.cardText}>{data.legalName}</Text>
              <Text style={playfulStyles.cardText}>{data.addressLine1}</Text>
              <Text style={playfulStyles.cardText}>{data.postalCode} {data.city}</Text>
              <Text style={playfulStyles.cardText}>ЕИК: {data.bulstat}</Text>
              {data.vatNumber && <Text style={playfulStyles.cardText}>ДДС: {data.vatNumber}</Text>}
            </View>
            <View style={playfulStyles.infoCard}>
              <Text style={[playfulStyles.cardTitle, { color: gradient.accent }]}>Клиент</Text>
              <Text style={playfulStyles.cardName}>{data.customerName}</Text>
              <Text style={playfulStyles.cardText}>{data.shippingLine1}</Text>
              <Text style={playfulStyles.cardText}>{data.shippingPostalCode} {data.shippingCity}</Text>
              <Text style={playfulStyles.cardText}>{data.customerEmail}</Text>
              {data.customerPhone && <Text style={playfulStyles.cardText}>{data.customerPhone}</Text>}
            </View>
          </View>

          {/* Items */}
          <View style={playfulStyles.itemsSection}>
            <Text style={[playfulStyles.sectionTitle, { color: gradient.accent }]}>Артикули</Text>
            {data.items.map((item, idx) => {
              const netPrice = getNetPrice(item.unitPrice, item.taxPercent);
              const vatAmount = getVatAmount(item.lineTotal, item.taxPercent);
              const qty = isRefund ? -item.quantity : item.quantity;
              const total = isRefund ? -item.lineTotal : item.lineTotal;
              return (
                <View style={playfulStyles.itemRow} key={idx}>
                  <View style={playfulStyles.itemLeft}>
                    <Text style={playfulStyles.itemName}>{item.name}</Text>
                    <Text style={playfulStyles.itemDetails}>
                      {qty} x {formatAmount(netPrice)} + ДДС {formatAmount(Math.abs(vatAmount))}
                    </Text>
                  </View>
                  <Text style={isRefund ? [playfulStyles.itemPrice, playfulStyles.negativeAmount] : playfulStyles.itemPrice}>
                    {formatAmount(total)}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Totals */}
          <View style={playfulStyles.totalsSection}>
            <View style={playfulStyles.totalRow}>
              <Text style={playfulStyles.totalLabel}>Междинна сума</Text>
              <Text style={playfulStyles.totalValue}>{formatAmount(data.subtotal)}</Text>
            </View>
            {data.discountAmount && data.discountAmount > 0 && !isRefund && (
              <View style={playfulStyles.totalRow}>
                <Text style={playfulStyles.totalLabel}>Отстъпка{data.discountCode ? ` (${data.discountCode})` : ""}</Text>
                <Text style={[playfulStyles.totalValue, { color: gradient.accent }]}>-{formatAmount(data.discountAmount)}</Text>
              </View>
            )}
            {!data.isPartialRefund && (
              <View style={playfulStyles.totalRow}>
                <Text style={playfulStyles.totalLabel}>Доставка</Text>
                <Text style={playfulStyles.totalValue}>{formatAmount(data.shippingTotal)}</Text>
              </View>
            )}
            <View style={playfulStyles.totalRow}>
              <Text style={playfulStyles.totalLabel}>ДДС (20%)</Text>
              <Text style={playfulStyles.totalValue}>{formatAmount(data.taxTotal)}</Text>
            </View>
            <View style={playfulStyles.totalRowFinal}>
              <Text style={playfulStyles.totalLabelFinal}>Обща сума</Text>
              <Text style={isRefund ? [playfulStyles.totalValueFinal, playfulStyles.negativeAmount] : [playfulStyles.totalValueFinal, { color: gradient.accent }]}>
                {formatAmount(data.total)}
              </Text>
            </View>
          </View>

          {/* Payment Badge */}
          <View style={[playfulStyles.paymentBadge, { backgroundColor: gradient.accent }]}>
            <Text style={playfulStyles.paymentText}>{data.paymentLabel} • {data.paymentDate}</Text>
          </View>

          {/* Footer */}
          <View style={playfulStyles.footer}>
            <View style={playfulStyles.contactBlock}>
              <Text style={[playfulStyles.contactText, { color: gradient.accent }]}>{data.contactEmail}</Text>
              <Text style={[playfulStyles.contactText, { color: gradient.accent }]}>{data.contactPhone}</Text>
              <Text style={[playfulStyles.transactionCode, { color: gradient.accent }]}>Код: {data.transactionCode}</Text>
            </View>
            <View style={playfulStyles.qrBlock}>
              {data.qrDataUrl && <Image src={data.qrDataUrl} style={playfulStyles.qrImage} />}
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ============================================
// MAIN COMPONENT - Template Selector
// ============================================
export function ReceiptPdf({ data }: { data: ReceiptPdfData }) {
  const template = data.receiptTemplate || "modern";

  switch (template) {
    case "classic":
      return <ClassicTemplate data={data} />;
    case "dark":
      return <DarkTemplate data={data} />;
    case "playful":
      return <PlayfulTemplate data={data} />;
    case "modern":
    default:
      return <ModernTemplate data={data} />;
  }
}
