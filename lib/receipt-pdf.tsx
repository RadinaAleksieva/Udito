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

// Register Roboto font with Cyrillic support
// Use local files for serverless compatibility
const fontPath = path.join(process.cwd(), "public/fonts");

Font.register({
  family: "Roboto",
  fonts: [
    { src: `${fontPath}/Roboto-Regular.ttf`, fontWeight: 400 },
    { src: `${fontPath}/Roboto-Bold.ttf`, fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
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
    width: 100,
    height: 60,
    justifyContent: "center",
  },
  logo: {
    objectFit: "contain",
    maxWidth: 100,
    maxHeight: 60,
  },
  logoFallback: {
    fontSize: 14,
    fontWeight: 600,
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
    fontWeight: 600,
    color: "#1a1a1a",
  },
  transactionCode: {
    fontSize: 8,
    fontWeight: 600,
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
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#6b6b6b",
    marginBottom: 8,
  },
  shopName: {
    fontSize: 12,
    fontWeight: 600,
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
    fontWeight: 600,
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
  colQty: { width: "12%", textAlign: "right" },
  colPrice: { width: "16%", textAlign: "right" },
  colTax: { width: "12%", textAlign: "right" },
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
    backgroundColor: "#e6f4f0",
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
    fontWeight: 600,
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
    fontWeight: 600,
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
    fontWeight: 600,
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
    marginBottom: 16,
  },
  contactBlock: {},
  contactLabel: {
    fontSize: 8,
    fontWeight: 600,
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
  note: {
    fontSize: 8,
    color: "#6b6b6b",
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
    paddingTop: 10,
    marginTop: "auto",
  },
  negativeAmount: {
    color: "#dc2626",
  },
});

// Official EUR/BGN conversion rate per regulation
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
};

export function ReceiptPdf({ data }: { data: ReceiptPdfData }) {
  const isRefund = data.receiptType === "refund";
  const showEur = data.showEurPrimary && data.currency === "BGN";

  const formatAmount = (amount: number) => {
    if (showEur) {
      return `${formatMoney(convertToEur(amount), "EUR")} / ${formatMoney(amount, data.currency)}`;
    }
    return formatMoney(amount, data.currency);
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoBlock}>
            {data.logoUrl ? (
              <Image src={data.logoUrl} style={styles.logo} />
            ) : (
              <Text style={styles.logoFallback}>{data.storeName}</Text>
            )}
          </View>
          <View style={styles.receiptMeta}>
            <Text style={isRefund ? [styles.receiptTitle, styles.refundTitle] : styles.receiptTitle}>
              {isRefund ? "СТОРНО бележка " : "Бележка "}
              <Text style={styles.receiptTitleBold}>{data.receiptNumber}</Text>
            </Text>
            {isRefund && data.referenceReceiptId && (
              <Text style={styles.refundReference}>
                към бележка #{data.referenceReceiptId}
              </Text>
            )}
            <Text style={styles.metaText}>
              Дата и час на издаване: <Text style={styles.metaBold}>{data.issuedDate}</Text>
            </Text>
            <Text style={styles.metaText}>
              № на поръчка: <Text style={styles.metaBold}>{data.orderNumber}</Text>
            </Text>
            <Text style={styles.metaText}>Уникален код на транзакцията:</Text>
            <Text style={styles.transactionCode}>{data.transactionCode}</Text>
          </View>
        </View>

        {/* Info Grid */}
        <View style={styles.infoGrid}>
          <View style={styles.infoColumn}>
            <Text style={styles.sectionTitle}>Данни за търговеца</Text>
            <Text style={styles.shopName}>{data.storeName}</Text>
            <Text style={styles.infoText}>{data.legalName}</Text>
            <Text style={styles.infoText}>{data.addressLine1}</Text>
            {data.addressLine2 && <Text style={styles.infoText}>{data.addressLine2}</Text>}
            <Text style={styles.infoText}>{data.postalCode} {data.city}</Text>
            <Text style={styles.infoText}>{data.country}</Text>
            <Text style={styles.infoText}>ЕИК: {data.bulstat}</Text>
            <Text style={styles.infoText}>ДДС №: {data.vatNumber}</Text>
          </View>
          <View style={styles.infoColumn}>
            <Text style={styles.sectionTitle}>Данни за клиента</Text>
            <Text style={styles.shopName}>{data.customerName}</Text>
            <Text style={styles.infoText}>{data.shippingLine1}</Text>
            {data.shippingLine2 && <Text style={styles.infoText}>{data.shippingLine2}</Text>}
            <Text style={styles.infoText}>{data.shippingPostalCode} {data.shippingCity}</Text>
            <Text style={styles.infoText}>{data.shippingCountry || "България"}</Text>
            <Text style={styles.infoText}>{data.customerEmail}</Text>
            <Text style={styles.infoText}>{data.customerPhone || "Липсва"}</Text>
            <Text style={styles.infoText}>Метод на доставка: {data.shippingMethod}</Text>
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.itemsSection}>
          <Text style={styles.sectionTitle}>Артикули</Text>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.colName]}>Артикул</Text>
              <Text style={[styles.tableHeaderCell, styles.colQty]}>Кол.</Text>
              <Text style={[styles.tableHeaderCell, styles.colPrice]}>Цена</Text>
              <Text style={[styles.tableHeaderCell, styles.colTax]}>Данък</Text>
              <Text style={[styles.tableHeaderCell, styles.colTotal]}>Общо</Text>
            </View>
            {data.items.map((item, idx) => (
              <View style={styles.tableRow} key={idx}>
                <Text style={[styles.tableCell, styles.colName]}>{item.name}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>
                  {isRefund ? -item.quantity : item.quantity}
                </Text>
                <Text style={[styles.tableCell, styles.colPrice]}>
                  {showEur
                    ? formatMoney(convertToEur(item.unitPrice), "EUR")
                    : formatMoney(item.unitPrice, data.currency)}
                </Text>
                <Text style={[styles.tableCell, styles.colTax]}>{item.taxPercent}%</Text>
                <Text style={isRefund ? [styles.tableCell, styles.colTotal, styles.negativeAmount] : [styles.tableCell, styles.colTotal]}>
                  {showEur
                    ? formatMoney(convertToEur(isRefund ? -item.lineTotal : item.lineTotal), "EUR")
                    : formatMoney(isRefund ? -item.lineTotal : item.lineTotal, data.currency)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsBox}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Междинна сума</Text>
              <Text style={styles.totalValue}>{formatAmount(data.subtotal)}</Text>
            </View>
            {data.discountAmount && data.discountAmount > 0 && !isRefund && (
              <View style={styles.discountRow}>
                <Text style={styles.totalLabel}>
                  Отстъпка{data.discountCode ? ` (${data.discountCode})` : ""}
                </Text>
                <Text style={styles.discountValue}>-{formatAmount(data.discountAmount)}</Text>
              </View>
            )}
            {!data.isPartialRefund && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Такса за доставка</Text>
                <Text style={styles.totalValue}>{formatAmount(data.shippingTotal)}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Данъци</Text>
              <Text style={styles.totalValue}>{formatAmount(data.taxTotal)}</Text>
            </View>
            <View style={styles.totalRowFinal}>
              <Text style={styles.totalLabelFinal}>Обща сума</Text>
              <Text style={isRefund ? [styles.totalValueFinal, styles.negativeAmount] : styles.totalValueFinal}>
                {formatAmount(data.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment */}
        <View style={styles.paymentSection}>
          <Text style={styles.sectionTitle}>Данни за плащане</Text>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentText}>{data.paymentDate}</Text>
            <Text style={styles.paymentText}>{data.paymentLabel}</Text>
            <Text style={isRefund ? [styles.paymentText, styles.negativeAmount] : styles.paymentText}>
              {formatAmount(data.total)}
            </Text>
          </View>
        </View>

        {/* Legal / Contact / QR */}
        <View style={styles.legalSection}>
          <View style={styles.contactBlock}>
            <Text style={styles.contactLabel}>Данни за контакт</Text>
            <Text style={styles.contactText}>{data.contactEmail}</Text>
            <Text style={styles.contactText}>{data.contactPhone}</Text>
          </View>
          <View style={styles.qrBlock}>
            {data.qrDataUrl ? (
              <Image src={data.qrDataUrl} style={styles.qrImage} />
            ) : (
              <Text style={styles.qrMissing}>
                Липсва уникален код на транзакцията за QR.
              </Text>
            )}
          </View>
        </View>

        {/* Note */}
        <Text style={styles.note}>
          Този документ е потвърждение за регистрирана продажба и е предоставен на клиента по електронен път.
        </Text>
      </Page>
    </Document>
  );
}
