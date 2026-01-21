import { initDb, getCompanyBySite, getOrderByIdForSite } from "@/lib/db";
import { upsertTenantOrder } from "@/lib/tenant-db";
import { getActiveStore } from "@/lib/auth";
import {
  extractTransactionRef,
  extractPaymentId,
  extractPaidAtFromPayment,
  extractPaymentSummaryFromPayment,
  extractTransactionRefFromPayment,
  fetchPaymentDetailsById,
  fetchPaymentRecordForOrder,
  fetchOrderDetails,
  fetchTransactionRefForOrder,
  needsOrderEnrichment,
  pickOrderFields,
} from "@/lib/wix";
import { getReceiptByOrderIdAndType } from "@/lib/receipts";
import { notFound, redirect } from "next/navigation";
import PdfViewer from "./pdf-viewer";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: { orderId: string };
  searchParams?: { type?: string; store?: string };
}) {
  await initDb();
  const orderId = params.orderId;
  const receiptType = searchParams?.type || "sale";

  // Security: Check user authentication and store access
  const store = await getActiveStore(searchParams?.store);
  if (!store) {
    redirect("/login");
  }
  const siteId = store.siteId || store.instanceId;
  const instanceId = store.instanceId;

  if (!siteId) {
    notFound();
  }

  const record = await getOrderByIdForSite(orderId, siteId);
  if (!record) {
    notFound();
  }

  const receiptRecord = await getReceiptByOrderIdAndType(siteId, orderId, receiptType);
  const companySiteId = record.site_id || siteId;
  const company = companySiteId ? await getCompanyBySite(companySiteId, instanceId) : null;
  const raw = (record.raw ?? {}) as any;
  let orderRaw: any = raw;
  const orderSiteId = record.site_id ?? siteId;
  let shouldUpdate = false;

  // Enrich order data if needed (wrapped in try-catch to handle Wix API failures)
  try {
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
  } catch (error) {
    console.warn("Failed to enrich order from Wix (continuing with local data):", error);
  }

  // Fetch transaction reference if missing
  const orderNumber = record.number || record.id || "";
  let transactionRef = extractTransactionRef(orderRaw);
  let paymentSummary = orderRaw?.udito?.paymentSummary ?? null;

  try {
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
  } catch (error) {
    console.warn("Failed to fetch transaction ref from Wix (continuing with local data):", error);
  }

  // Fetch payment details if missing
  if (!transactionRef || !paymentSummary || !orderRaw?.udito?.paidAt) {
    let paymentId = extractPaymentId(orderRaw);
    let paymentRef: string | null = null;
    let paidAt: string | null = null;

    if (!paymentId) {
      const paymentRecord = await fetchPaymentRecordForOrder({
        orderId,
        orderNumber: orderNumber || null,
        siteId: orderSiteId,
        instanceId,
      });
      paymentId = paymentRecord.paymentId;
      paymentRef = paymentRecord.transactionRef;
      paidAt = paymentRecord.paidAt;
      paymentSummary = paymentSummary ?? paymentRecord.paymentSummary ?? null;

      if (paymentRecord.payment) {
        orderRaw = { ...orderRaw, payment: paymentRecord.payment };
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
      const paymentRefFromDetails = extractTransactionRefFromPayment(payment);
      const paidAtFromDetails = extractPaidAtFromPayment(payment);
      const summaryFromDetails = extractPaymentSummaryFromPayment(payment);

      if (paymentRefFromDetails || paidAtFromDetails || summaryFromDetails) {
        transactionRef = paymentRefFromDetails || transactionRef;
        orderRaw = {
          ...orderRaw,
          udito: {
            ...(orderRaw.udito ?? {}),
            ...(paymentRefFromDetails ? { transactionRef: paymentRefFromDetails } : {}),
            ...(paidAtFromDetails ? { paidAt: paidAtFromDetails } : {}),
            ...(summaryFromDetails ? { paymentSummary: summaryFromDetails } : {}),
          },
        };
        shouldUpdate = true;
      }
    }
  }

  // Update order in database if enriched
  if (shouldUpdate) {
    const existingSource = (record.source === "webhook" ? "webhook" : "backfill") as "webhook" | "backfill";
    const mapped = pickOrderFields(orderRaw, existingSource);
    await upsertTenantOrder(orderSiteId, {
      ...mapped,
      raw: orderRaw,
    });
  }

  // Check if store has the required store_id for receipts
  const storeId = company?.store_id ?? null;
  if (!storeId) {
    return (
      <div style={{ maxWidth: 600, margin: "40px auto", padding: 20, textAlign: "center" }}>
        <h2>Липсва уникален код на магазина</h2>
        <p>
          За този магазин не е въведен уникален код на магазина.
          Документ за регистрирана продажба не може да бъде издаден.
        </p>
        <p>
          Отворете <a href="/settings" style={{ color: "#2563eb" }}>Настройки</a> и въведете кода.
        </p>
        <a
          href="/receipts"
          style={{
            display: "inline-block",
            marginTop: 20,
            padding: "10px 20px",
            background: "#f3f4f6",
            borderRadius: 8,
            textDecoration: "none",
            color: "#374151",
          }}
        >
          ← Назад към списъка
        </a>
      </div>
    );
  }

  // Render PDF viewer - this shows the exact same PDF that will be downloaded
  return (
    <PdfViewer
      orderId={orderId}
      receiptId={receiptRecord?.id ? Number(receiptRecord.id) : null}
      receiptType={receiptType}
      storeId={siteId}
      returnPaymentType={receiptRecord?.return_payment_type ?? null}
      referenceReceiptId={receiptRecord?.reference_receipt_id ?? null}
    />
  );
}
