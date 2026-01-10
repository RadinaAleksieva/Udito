import TokenCapture from "./token-capture";
import TopNav from "../components/top-nav";
import MonthFilter from "../components/month-filter";
import {
  countOrdersForPeriodForSite,
  countOrdersForSite,
  getCompanyBySite,
  initDb,
  listRecentOrdersForPeriodForSite,
} from "@/lib/db";
import { getAccessToken } from "@/lib/wix";
import { getActiveWixToken } from "@/lib/wix-context";
import BackfillButton from "./backfill-button";
import EnrichButton from "./enrich-button";
import {
  deriveOrderCreatedAt,
  deriveOrderMoney,
  deriveOrderNumber,
  isArchivedOrder,
} from "@/lib/order-display";
import ConnectionCheck from "./connection-check";
import AutoSync from "./auto-sync";

export const dynamic = "force-dynamic";

const WIX_API_BASE = process.env.WIX_API_BASE || "https://www.wixapis.com";

function formatMoney(amount: number | null | undefined, currency: string | null) {
  if (amount == null || !currency) return "—";
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return "—";
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatPaymentStatus(paymentStatus: string | null, orderStatus?: string | null) {
  // Check if order is canceled first
  const statusText = String(orderStatus ?? "").toLowerCase();
  if (statusText.includes("cancel")) return "Отказана";

  // Otherwise show payment status
  if (!paymentStatus) return "—";
  if (paymentStatus === "PAID") return "Платена";
  if (paymentStatus === "NOT_PAID") return "Неплатена";
  if (paymentStatus === "PARTIALLY_PAID") return "Частично платена";
  return paymentStatus;
}

async function fetchSiteLabel(siteId: string | null, instanceId: string | null) {
  if (!siteId && !instanceId) return null;
  try {
    const accessToken = await getAccessToken({ siteId, instanceId });
    const authHeader = accessToken.startsWith("Bearer ")
      ? accessToken
      : `Bearer ${accessToken}`;
    const response = await fetch(`${WIX_API_BASE}/sites/v1/site`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        ...(siteId ? { "wix-site-id": siteId } : {}),
      },
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = await response.json();
    const site = data?.site ?? data?.data ?? data ?? {};
    return (
      site?.displayUrl ??
      site?.url ??
      site?.siteDisplayUrl ??
      site?.siteUrl ??
      site?.domain ??
      site?.name ??
      null
    );
  } catch (error) {
    console.warn("Site label fetch failed", error);
    return null;
  }
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams?: { debug?: string; month?: string };
}) {
  await initDb();
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;
  const instanceId = token?.instance_id ?? null;
  const now = new Date();
  const monthParam = searchParams?.month || "";
  const showDebug = searchParams?.debug === "1";
  const monthMatch = monthParam.match(/^(\d{4})-(\d{2})$/);
  const selectedYear = monthMatch ? Number(monthMatch[1]) : now.getFullYear();
  const selectedMonthIndex = monthMatch
    ? Math.max(0, Math.min(11, Number(monthMatch[2]) - 1))
    : now.getMonth();
  const monthStart = new Date(selectedYear, selectedMonthIndex, 1, 0, 0, 0);
  const monthEnd = new Date(
    selectedYear,
    selectedMonthIndex + 1,
    0,
    23,
    59,
    59,
    999
  );
  const monthLabel = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(
    2,
    "0"
  )}`;
  const monthOptions = Array.from({ length: 12 }, (_, idx) => {
    const date = new Date(now.getFullYear(), now.getMonth() - idx, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    return {
      value,
      label: date.toLocaleDateString("bg-BG", {
        year: "numeric",
        month: "long",
      }),
    };
  });
  const effectiveSiteId = siteId ?? instanceId ?? null;
  const orders = effectiveSiteId
    ? await listRecentOrdersForPeriodForSite(
        monthStart.toISOString(),
        monthEnd.toISOString(),
        effectiveSiteId,
        50 // Show more orders (up to 50)
      )
    : [];
  const company = await getCompanyBySite(siteId, instanceId);
  const siteLabel = await fetchSiteLabel(siteId, instanceId);
  const totalOrdersCount = effectiveSiteId ? await countOrdersForSite(effectiveSiteId) : 0;
  const monthOrdersCount = effectiveSiteId
    ? await countOrdersForPeriodForSite(
        monthStart.toISOString(),
        monthEnd.toISOString(),
        effectiveSiteId
      )
    : 0;
  const monthLabelText = monthOptions.find((option) => option.value === monthLabel)
    ?.label;
  const hasConnection = Boolean(siteId);
  const hasInstance = Boolean(token?.instance_id);
  const domainLabel = siteLabel || company?.store_domain || null;
  const activeStoreLabel = domainLabel || siteId || "Неизбран";
  const displayOrders = orders.filter((order) => {
    const raw = (order as any).raw ?? null;
    return !isArchivedOrder(raw);
  });
  const lastClosedDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastClosedLabel = `${lastClosedDate.getFullYear()}-${String(
    lastClosedDate.getMonth() + 1
  ).padStart(2, "0")}`;
  const lastClosedText = lastClosedDate.toLocaleDateString("bg-BG", {
    year: "numeric",
    month: "long",
  });

  return (
    <main>
      <TokenCapture />
      <AutoSync />
      <TopNav title="UDITO Табло" />
      <div className="container">
        <section className="hero">
          <div>
            <h1>Поръчки, електронни бележки и месечни одиторски файлове.</h1>
            <p>
              Това табло показва синхронизирани поръчки, електронни бележки и статуса
              на месечния XML файл.
            </p>
            <div className="status-grid">
              <div className="status-card">
                <span>Връзка с Wix</span>
                <strong>{hasConnection ? "Свързано" : "Няма връзка"}</strong>
                <ConnectionCheck />
              </div>
              <div className="status-card">
                <span>Активен магазин</span>
                {domainLabel ? (
                  <a
                    className="status-wrap status-link"
                    href={
                      domainLabel.startsWith("http")
                        ? domainLabel
                        : `https://${domainLabel}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {activeStoreLabel}
                  </a>
                ) : (
                  <strong className="status-wrap">{activeStoreLabel}</strong>
                )}
                <span className="status-meta">
                  {siteId
                    ? "Данните са за този сайт."
                    : "Отворете приложението от Wix, за да се зареди сайтът."}
                </span>
              </div>
              <div className="status-card">
                <span>Записани поръчки</span>
                <strong>{totalOrdersCount}</strong>
                <span className="status-meta">
                  {monthLabelText
                    ? `За ${monthLabelText}: ${monthOrdersCount}`
                    : `${monthOrdersCount} за месеца`}
                </span>
                <MonthFilter
                  value={monthLabel}
                  options={monthOptions}
                  label="Месец"
                />
              </div>
              <div className="status-card">
                <span>Одиторски файл</span>
                <strong>Готов</strong>
                <a className="status-link" href={`/api/audit/monthly?month=${lastClosedLabel}`}>
                  Изтегли XML за {lastClosedText}
                </a>
              </div>
            </div>
            {showDebug ? (
              <>
                <BackfillButton />
                <EnrichButton />
              </>
            ) : null}
          </div>
          <div className="hero-card">
            {hasConnection ? (
              <>
                <h2>Какво прави UDITO</h2>
                <p>
                  UDITO синхронизира поръчките от Wix, издава електронни бележки при
                  платени поръчки и генерира месечен одиторски XML файл.
                </p>
                <div className="grid">
                  <div className="card">
                    <h3>Поръчки</h3>
                    <p>Получава и обновява поръчки в реално време.</p>
                  </div>
                  <div className="card">
                    <h3>Електронни бележки</h3>
                    <p>Издава бележки при платени поръчки.</p>
                  </div>
                  <div className="card">
                    <h3>Одиторски файл</h3>
                    <p>Готов XML за приключени месеци.</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2>Следващи стъпки</h2>
                <p>
                  Свържете Wix магазина, изберете шаблон за бележки и
                  експортирайте месечния XML файл оттук.
                </p>
                <div className="grid">
                  <div className="card">
                    <h3>Уебхукове</h3>
                    <p>Очаква поръчки от Wix.</p>
                  </div>
                  <div className="card">
                    <h3>Шаблон за бележки</h3>
                    <p>Готов за свързване.</p>
                  </div>
                  <div className="card">
                    <h3>Одиторски експорт</h3>
                    <p>XML генераторът е готов за данни.</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
        {showDebug ? (
          <section className="orders">
            <h2>Диагностика</h2>
            <div className="orders-table">
              <div className="orders-head">
                <span>Поле</span>
                <span>Стойност</span>
              </div>
              <div className="orders-row">
                <span>Активен siteId</span>
                <span>{siteId || "—"}</span>
              </div>
              <div className="orders-row">
                <span>Активен instanceId</span>
                <span>{instanceId || "—"}</span>
              </div>
              <div className="orders-row">
                <span>Wix token</span>
                <span>{hasInstance ? "има" : "липсва"}</span>
              </div>
            </div>
          </section>
        ) : null}
        <section className="orders">
          <h2>Поръчки за {monthLabelText || monthLabel}</h2>
          {displayOrders.length === 0 ? (
            <p>Все още няма поръчки. Уебхуковете или бекфил ще ги добавят.</p>
          ) : (
            <div className="orders-table">
              <div className="orders-head">
                <span>Поръчка</span>
                <span>Статус</span>
                <span>Общо</span>
                <span>Източник</span>
                <span>Създадена</span>
              </div>
              {displayOrders.map((order) => {
                const raw = (order as any).raw ?? null;
                const { totalAmount, currency } = deriveOrderMoney(
                  raw,
                  order.total,
                  order.currency ?? null
                );
                const number = deriveOrderNumber(raw, order.number);
                const createdAt = deriveOrderCreatedAt(raw, order.created_at);
                const sourceLabel =
                  order.source === "backfill" || order.source === "webhook"
                    ? "Wix"
                    : order.source;

                // Determine row class based on status
                const statusText = String(order.status ?? "").toLowerCase();
                const isCancelled = statusText.includes("cancel");
                const isPaid = order.payment_status === "PAID";
                const isUnpaid = order.payment_status === "NOT_PAID" || order.payment_status === "UNPAID";

                const rowClass = [
                  "orders-row",
                  isCancelled ? "orders-row--cancelled" : "",
                  isPaid && !isCancelled ? "orders-row--paid" : "",
                  isUnpaid && !isCancelled ? "orders-row--unpaid" : "",
                ].filter(Boolean).join(" ");

                return (
                  <div className={rowClass} key={order.id}>
                    <span>{number || order.id}</span>
                    <span>{formatPaymentStatus(order.payment_status || null, order.status)}</span>
                    <span>{formatMoney(totalAmount, currency)}</span>
                    <span>{sourceLabel || "—"}</span>
                    <span>
                      {createdAt
                        ? new Date(createdAt).toLocaleString("bg-BG", {
                            timeZone: "Europe/Sofia",
                          })
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {displayOrders.length > 0 && (
            <div style={{ marginTop: "16px", textAlign: "center" }}>
              <a
                href={`/orders?month=${monthLabel}`}
                className="btn-secondary"
                style={{ display: "inline-block" }}
              >
                Виж всички поръчки за {monthLabelText || monthLabel}
              </a>
            </div>
          )}
        </section>
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
