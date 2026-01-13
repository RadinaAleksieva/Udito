import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { getActiveWixContext } from "@/lib/wix-context";
import {
  extractPaidAtFromPayment,
  extractPaymentSummaryFromPayment,
  extractTransactionRefFromPayment,
  fetchPaymentDetailsById,
  fetchPaymentRecordForOrder,
  getAccessToken,
  getTokenInfo,
} from "@/lib/wix";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await initDb();
    const { siteId, instanceId } = await getActiveWixContext();
    if (!siteId && !instanceId) {
      return NextResponse.json(
        { ok: false, error: "Missing site context." },
        { status: 400 }
      );
    }
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");
    const orderNumber = url.searchParams.get("orderNumber");
    const paymentIdParam = url.searchParams.get("paymentId");
    if (!orderId && !orderNumber && !paymentIdParam) {
      return NextResponse.json(
        { ok: false, error: "Missing orderId, orderNumber, or paymentId." },
        { status: 400 }
      );
    }
    const record = orderId || orderNumber
      ? await fetchPaymentRecordForOrder({
          orderId: orderId ?? "",
          orderNumber: orderNumber ?? null,
          siteId: siteId ?? null,
          instanceId: instanceId ?? null,
        })
      : { paymentId: paymentIdParam, transactionRef: null, paidAt: null };
    const accessToken = await getAccessToken({
      siteId: siteId ?? null,
      instanceId: instanceId ?? null,
    });
    let tokenInfo: unknown = null;
    try {
      tokenInfo = await getTokenInfo(accessToken);
    } catch (error) {
      tokenInfo = { error: (error as Error).message };
    }
    const authHeader = accessToken.startsWith("Bearer ")
      ? accessToken
      : `Bearer ${accessToken}`;
    const queryDiagnostics: Array<{
      endpoint: string;
      filter: Record<string, unknown>;
      status: number;
      body: string;
    }> = [];
    const filters = [
      orderId ? { orderId: { $eq: orderId } } : null,
      orderNumber ? { orderNumber: { $eq: orderNumber } } : null,
      orderNumber ? { referenceId: { $eq: orderNumber } } : null,
    ].filter(Boolean) as Array<Record<string, unknown>>;
    const paymentEndpoints = [
      "https://www.wixapis.com/payments/v1/payments/query",
      "https://www.wixapis.com/_api/payments/v1/payments/query",
      "https://www.wixapis.com/_api/ecom-payments/v1/payments/query",
      "https://manage.wix.com/_api/payments/v1/payments/query",
      "https://manage.wix.com/_api/ecom-payments/v1/payments/query",
    ];
    for (const endpoint of paymentEndpoints) {
      for (const filter of filters) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            ...(siteId ? { "wix-site-id": siteId } : {}),
          },
          body: JSON.stringify({ filter, paging: { limit: 1 } }),
        });
        const body = await response.text();
        queryDiagnostics.push({ endpoint, filter, status: response.status, body });
      }
    }
    let txDiagnostics: Array<{ endpoint: string; status: number; body: string }> | null =
      null;
    if (orderId) {
      const txEndpoints = [
        "https://www.wixapis.com/payments/v1/transactions/query",
        "https://www.wixapis.com/_api/payments/v1/transactions/query",
        "https://www.wixapis.com/_api/ecom-payments/v1/transactions/query",
        "https://manage.wix.com/_api/payments/v1/transactions/query",
        "https://manage.wix.com/_api/ecom-payments/v1/transactions/query",
      ];
      txDiagnostics = [];
      for (const endpoint of txEndpoints) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            ...(siteId ? { "wix-site-id": siteId } : {}),
          },
          body: JSON.stringify({ filter: { orderId: { $eq: orderId } } }),
        });
        const body = await response.text();
        txDiagnostics.push({ endpoint, status: response.status, body });
      }
    }
    let paymentDetails = null;
    let extracted = null;
    if (record.paymentId) {
      const payment = await fetchPaymentDetailsById({
        paymentId: record.paymentId,
        siteId: siteId ?? null,
        instanceId: instanceId ?? null,
      });
      paymentDetails = payment;
      extracted = {
        transactionRef: extractTransactionRefFromPayment(payment),
        paidAt: extractPaidAtFromPayment(payment),
        summary: extractPaymentSummaryFromPayment(payment),
      };
    }
    const paymentDetailsDiagnostics: Array<{
      endpoint: string;
      status: number;
      body: string;
    }> = [];
    const orderTransactionsDiagnostics: Array<{
      endpoint: string;
      status: number;
      body: string;
    }> = [];
    if (paymentIdParam) {
      const getEndpoints = [
        `https://www.wixapis.com/payments/v1/payments/${paymentIdParam}`,
        `https://www.wixapis.com/_api/payments/v1/payments/${paymentIdParam}`,
        `https://www.wixapis.com/_api/ecom-payments/v1/payments/${paymentIdParam}`,
        `https://manage.wix.com/_api/payments/v1/payments/${paymentIdParam}`,
        `https://manage.wix.com/_api/ecom-payments/v1/payments/${paymentIdParam}`,
      ];
      for (const endpoint of getEndpoints) {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            ...(siteId ? { "wix-site-id": siteId } : {}),
          },
        });
        const body = await response.text();
        paymentDetailsDiagnostics.push({ endpoint, status: response.status, body });
      }
      const postEndpoints = [
        "https://www.wixapis.com/payments/v1/payments/get",
        "https://www.wixapis.com/_api/payments/v1/payments/get",
        "https://www.wixapis.com/_api/ecom-payments/v1/payments/get",
        "https://manage.wix.com/_api/payments/v1/payments/get",
        "https://manage.wix.com/_api/ecom-payments/v1/payments/get",
      ];
      for (const endpoint of postEndpoints) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            ...(siteId ? { "wix-site-id": siteId } : {}),
          },
          body: JSON.stringify({ id: paymentIdParam }),
        });
        const body = await response.text();
        paymentDetailsDiagnostics.push({ endpoint, status: response.status, body });
      }
    }
    if (orderId) {
      const orderTxEndpoints = [
        `https://www.wixapis.com/ecom/v1/payments/orders/${orderId}`,
        `https://www.wixapis.com/v1/payments/orders/${orderId}`,
        `https://www.wixapis.com/_api/ecom-payments/v1/payments/orders/${orderId}`,
        `https://www.wixapis.com/_api/payments/v1/payments/orders/${orderId}`,
        `https://manage.wix.com/_api/ecom-payments/v1/payments/orders/${orderId}`,
      ];
      for (const endpoint of orderTxEndpoints) {
        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
            ...(siteId ? { "wix-site-id": siteId } : {}),
          },
        });
        const body = await response.text();
        orderTransactionsDiagnostics.push({
          endpoint,
          status: response.status,
          body,
        });
      }
    }
    return NextResponse.json({
      ok: true,
      siteId,
      instanceId,
      record,
      paymentDetails,
      extracted,
      queryDiagnostics,
      txDiagnostics,
      paymentDetailsDiagnostics,
      orderTransactionsDiagnostics,
      tokenInfo,
    });
  } catch (error) {
    console.error("Payment debug failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
