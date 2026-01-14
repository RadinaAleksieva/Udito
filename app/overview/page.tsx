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
import { getActiveWixContext } from "@/lib/wix-context";
import BackfillButton from "./backfill-button";
import EnrichButton from "./enrich-button";
// Note: deriveOrder* functions removed - using extracted columns directly for efficiency
import { countReceiptsForPeriodForSite } from "@/lib/receipts";
import ConnectionCheck from "./connection-check";
import AutoSync from "./auto-sync";
import { auth, getUserStores, linkStoreToUser, getActiveStore } from "@/lib/auth";
import Link from "next/link";
import StoreSelector from "../components/store-selector";
import SubscriptionBanner from "../components/subscription-banner";

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
  if (paymentStatus === "FULLY_REFUNDED" || paymentStatus === "PARTIALLY_REFUNDED") return "Възстановени суми";
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
  searchParams?: { debug?: string; month?: string; store?: string; instanceId?: string; instance_id?: string; siteId?: string; site_id?: string; instance?: string; loginBroadcast?: string };
}) {
  await initDb();

  const session = await auth();

  // Check if user needs onboarding (has logged in but hasn't completed company data)
  if (session?.user?.id) {
    const { redirect } = await import("next/navigation");
    const { sql } = await import("@vercel/postgres");

    // Check if user has completed onboarding
    const businessResult = await sql`
      SELECT bp.bulstat, bp.store_id
      FROM business_users bu
      JOIN business_profiles bp ON bp.business_id = bu.business_id
      WHERE bu.user_id = ${session.user.id}
      LIMIT 1
    `;

    const needsOnboarding = businessResult.rows.length === 0 ||
      !businessResult.rows[0].bulstat ||
      !businessResult.rows[0].store_id;

    if (needsOnboarding) {
      redirect("/onboarding");
    }
  }

  let userStores = session?.user?.id ? await getUserStores(session.user.id) : [];
  let needsStoreConnection = false;

  // Check for Wix params in URL (for iframe context)
  const urlInstanceId = searchParams?.instanceId || searchParams?.instance_id || null;
  const urlSiteId = searchParams?.siteId || searchParams?.site_id || null;
  const urlInstance = searchParams?.instance || null;
  const selectedStoreId = searchParams?.store || urlSiteId || urlInstanceId || null;

  // Detect if we're in Wix context (came from Wix iframe with instance params)
  // In Wix context, we should only show the current store, not a selector
  const isWixContext = Boolean(urlInstance || urlInstanceId || urlSiteId);

  // Auto-link Wix store from URL params (handles switching between Wix stores)
  if (session?.user?.id && (urlSiteId || urlInstanceId)) {
    const storeIdToCheck = urlSiteId || urlInstanceId;
    const isStoreLinked = userStores.some(
      (s: any) => s.site_id === storeIdToCheck || s.instance_id === storeIdToCheck
    );
    if (!isStoreLinked) {
      try {
        await linkStoreToUser(session.user.id, urlSiteId || "", urlInstanceId || undefined);
        userStores = await getUserStores(session.user.id);
        console.log("Auto-linked new store from URL params:", storeIdToCheck);
      } catch (e) {
        console.error("Auto-link store failed:", e);
      }
    }
  } else if (session?.user?.id && userStores.length === 0) {
    // Fallback: try to get from cookies/context
    const wixContext = await getActiveWixContext();
    if (wixContext.siteId || wixContext.instanceId) {
      try {
        await linkStoreToUser(session.user.id, wixContext.siteId || "", wixContext.instanceId || undefined);
        userStores = await getUserStores(session.user.id);
      } catch (e) {
        console.error("Auto-link store failed:", e);
      }
    }
  }

  // Use centralized store getter with optional selected store ID
  const store = await getActiveStore(selectedStoreId);
  const siteId = store?.siteId || null;
  const instanceId = store?.instanceId || null;

  // Check if user needs to connect a store
  if (session?.user?.id && !store) {
    needsStoreConnection = true;
  }
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
  const monthReceiptsCount = effectiveSiteId
    ? await countReceiptsForPeriodForSite(
        monthStart.toISOString(),
        monthEnd.toISOString(),
        effectiveSiteId
      )
    : 0;
  const monthLabelText = monthOptions.find((option) => option.value === monthLabel)
    ?.label;
  const hasConnection = Boolean(siteId);
  const hasInstance = Boolean(instanceId);
  // Prioritize company.store_domain if set (user's preference), then Wix API, then fallback
  const domainLabel = company?.store_domain || siteLabel || null;
  const activeStoreLabel = domainLabel || siteId || "Неизбран";
  // Archive filtering is now done in SQL query - no client-side filter needed
  const displayOrders = orders;
  const lastClosedDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastClosedLabel = `${lastClosedDate.getFullYear()}-${String(
    lastClosedDate.getMonth() + 1
  ).padStart(2, "0")}`;
  const lastClosedText = lastClosedDate.toLocaleDateString("bg-BG", {
    year: "numeric",
    month: "long",
  });

  // Show connect store message if needed
  if (needsStoreConnection) {
    return (
      <main>
        <TopNav title="UDITO Табло" />
        <div className="container">
          <section className="hero">
            <div>
              <h1>Добре дошли в UDITO!</h1>
              <p>
                За да използвате приложението, трябва да свържете вашия Wix магазин.
              </p>
              <div className="connect-store-box">
                <div className="connect-store-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                    <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <h2>Свържете вашия магазин</h2>
                <p>
                  Отворете <strong>UDITO</strong> от Wix Dashboard на вашия магазин.
                  Приложението автоматично ще се свърже с вашия акаунт.
                </p>
                <div className="connect-store-steps">
                  <div className="connect-step">
                    <span className="step-number">1</span>
                    <span>Отидете в <a href="https://manage.wix.com" target="_blank" rel="noreferrer">Wix Dashboard</a></span>
                  </div>
                  <div className="connect-step">
                    <span className="step-number">2</span>
                    <span>Инсталирайте UDITO от App Market</span>
                  </div>
                  <div className="connect-step">
                    <span className="step-number">3</span>
                    <span>Отворете приложението от Dashboard</span>
                  </div>
                </div>
                <p className="connect-store-note">
                  Ако вече имате инсталирано приложението, можете да въведете Instance ID от{" "}
                  <Link href="/settings">Настройки</Link>.
                </p>
              </div>
            </div>
            <div className="hero-card">
              <h2>Какво прави UDITO</h2>
              <p>
                UDITO е приложение за алтернативен режим на отчитане на продажби
                за Wix магазини в България.
              </p>
              <div className="grid">
                <div className="card">
                  <h3>Електронни бележки</h3>
                  <p>Автоматично издаване при платена поръчка.</p>
                </div>
                <div className="card">
                  <h3>Одиторски файл</h3>
                  <p>Месечен XML за НАП.</p>
                </div>
                <div className="card">
                  <h3>Синхронизация</h3>
                  <p>Реално време с Wix.</p>
                </div>
              </div>
            </div>
          </section>
        </div>
        <footer className="footer">UDITO от ДИЗАЙНС БАЙ ПО ЕООД</footer>
      </main>
    );
  }

  return (
    <main>
      <TokenCapture />
      <AutoSync />
      <TopNav title="UDITO Табло" />
      <SubscriptionBanner />
      <div className="container">
        <section className="hero">
          <div>
            <h1>Поръчки, електронни бележки и месечни одиторски файлове.</h1>
            <p>
              Това табло показва синхронизирани поръчки, електронни бележки и статуса
              на месечния XML файл.
            </p>
            {userStores.length > 0 && (
              <StoreSelector
                stores={userStores.map((s: any) => ({
                  id: s.id?.toString() || s.site_id || s.instance_id,
                  site_id: s.site_id,
                  instance_id: s.instance_id,
                  store_name: s.store_name,
                  store_domain: s.store_domain,
                }))}
                currentSiteId={siteId || instanceId}
                hidden={isWixContext}
              />
            )}
            <div className="status-grid">
              <div className="status-card">
                <span>Връзка с Wix</span>
                <strong>{hasConnection ? "Свързано" : "Няма връзка"}</strong>
                <ConnectionCheck currentSiteId={siteId} currentInstanceId={instanceId} />
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
                    ? `За ${monthLabelText}: ${monthOrdersCount} поръчки, ${monthReceiptsCount} бележки`
                    : `${monthOrdersCount} поръчки, ${monthReceiptsCount} бележки`}
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
                // Use extracted columns directly - no need to parse raw JSON
                const totalAmount = order.total ? Number(order.total) : null;
                const currency = order.currency ?? null;
                const number = order.number;
                const createdAt = order.created_at;
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
      <footer className="footer">UDITO от ДИЗАЙНС БАЙ ПО ЕООД</footer>
    </main>
  );
}
