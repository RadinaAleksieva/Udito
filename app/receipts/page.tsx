import TopNav from "../components/top-nav";
import MonthFilter from "../components/month-filter";
import { getOrderByIdForSite, initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";
import {
  listReceiptsWithOrdersForPeriodForSite,
  listReceiptsWithOrdersForSite,
} from "@/lib/receipts";
import { extractTransactionRef } from "@/lib/wix";

export const dynamic = "force-dynamic";

type ReceiptRow = {
  receipt_id?: number | null;
  order_id: string;
  issued_at: string | null;
  status: string | null;
  payload: any;
  order_number?: string | null;
  customer_name?: string | null;
  total?: string | null;
  currency?: string | null;
  receipt_type?: string | null;
  reference_receipt_id?: number | null;
  refund_amount?: string | number | null;
};

function extractCustomerName(raw: any, fallback: string | null | undefined) {
  if (fallback) return fallback;
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
  return full || "—";
}

function formatReceiptStatus(status: string | null) {
  if (!status) return "—";
  if (status === "issued") return "Издадена";
  return status;
}

function formatReceiptType(type: string | null | undefined): string {
  if (!type || type === "sale") return "Продажба";
  if (type === "refund") return "Сторно";
  return type;
}

function getReceiptTypeClass(type: string | null | undefined): string {
  if (type === "refund") return "receipt-refund";
  return "";
}

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams?: { month?: string };
}) {
  await initDb();
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;
  const now = new Date();

  // Default to current month instead of "all"
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthParam = searchParams?.month || currentMonth;
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
  const receipts =
    monthMatch && rangeStart && rangeEnd && siteId
      ? await listReceiptsWithOrdersForPeriodForSite(
          rangeStart,
          rangeEnd,
          siteId
        )
      : siteId
        ? await listReceiptsWithOrdersForSite(siteId, 1000)
        : [];

  const dbReceipts = receipts as ReceiptRow[];
  const displayReceipts: ReceiptRow[] = [];
  for (const receipt of dbReceipts) {
    let customerName = receipt.customer_name || "";
    if (siteId && (!customerName || customerName === "—")) {
      const order = await getOrderByIdForSite(receipt.order_id, siteId);
      if (order) {
        const raw = (order.raw ?? {}) as any;
        customerName = extractCustomerName(raw, order.customer_name);
      }
    }
    displayReceipts.push({ ...receipt, customer_name: customerName });
  }

  return (
    <main>
      <TopNav title="Електронни бележки" />
      <div className="container">
        <section className="orders">
          <div className="section-header">
            <h2>Електронни бележки</h2>
            <a href="/receipts/settings" className="btn-secondary">
              Настройки
            </a>
          </div>
          <MonthFilter
            value={monthValue}
            options={monthOptions}
            label="Месец"
          />
          {displayReceipts.length === 0 ? (
            <p>Няма издадени бележки за избрания период.</p>
          ) : (
            <div className="orders-table">
              <div className="orders-head orders-head--receipts">
                <span>Бележка</span>
                <span>Тип</span>
                <span>Поръчка</span>
                <span>Клиент</span>
                <span>Сума</span>
                <span>Издадена</span>
                <span>Преглед</span>
                <span>Изтегляне</span>
              </div>
              {displayReceipts.map((receipt) => {
                const isRefund = receipt.receipt_type === "refund";
                const displayAmount = isRefund
                  ? `-${Math.abs(Number(receipt.refund_amount || receipt.total || 0)).toFixed(2)}`
                  : Number(receipt.total || 0).toFixed(2);
                const currency = receipt.currency || "BGN";
                return (
                  <div
                    className={`orders-row orders-row--receipts ${getReceiptTypeClass(receipt.receipt_type)}`}
                    key={`${receipt.order_id}-${receipt.receipt_type || "sale"}`}
                  >
                    <span>
                      {receipt.receipt_id != null
                        ? String(receipt.receipt_id).padStart(10, "0")
                        : "—"}
                    </span>
                    <span className={isRefund ? "receipt-type-refund" : ""}>
                      {formatReceiptType(receipt.receipt_type)}
                      {isRefund && receipt.reference_receipt_id && (
                        <small className="refund-ref">
                          {" "}
                          (към #{receipt.reference_receipt_id})
                        </small>
                      )}
                    </span>
                    <span>{receipt.order_number || receipt.order_id}</span>
                    <span>{receipt.customer_name || "—"}</span>
                    <span className={isRefund ? "receipt-amount-negative" : ""}>
                      {displayAmount} {currency}
                    </span>
                    <span>
                      {receipt.issued_at ? (
                        <>
                          {new Date(receipt.issued_at).toLocaleDateString("bg-BG", {
                            timeZone: "Europe/Sofia",
                          })}
                          <br />
                          {new Date(receipt.issued_at).toLocaleTimeString("bg-BG", {
                            timeZone: "Europe/Sofia",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })} ч.
                        </>
                      ) : "—"}
                    </span>
                    <span>
                      <a className="status-link" href={`/receipts/${receipt.order_id}?type=${receipt.receipt_type || "sale"}&month=${monthValue}`}>
                        Преглед
                      </a>
                    </span>
                    <span>
                      <a
                        className="status-link"
                        href={`/receipts/${receipt.order_id}?type=${receipt.receipt_type || "sale"}&print=1&month=${monthValue}`}
                      >
                        Изтегли
                      </a>
                    </span>
                  </div>
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
