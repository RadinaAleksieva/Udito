import TopNav from "../components/top-nav";
import MonthFilter from "../components/month-filter";
import { initDb } from "@/lib/db";
import { listOrdersWithReceiptsForAudit } from "@/lib/receipts";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

function formatMoney(amount: number | null | undefined, currency: string | null) {
  if (amount == null || !currency) return "—";
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: { month?: string };
}) {
  await initDb();
  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;
  const now = new Date();
  const monthParam = searchParams?.month || "";
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
  // Get sale receipts for audit file
  // Refund receipts are included separately in the <rorder> section of the XML
  const monthlyOrders = siteId
    ? await listOrdersWithReceiptsForAudit(
        monthStart.toISOString(),
        monthEnd.toISOString(),
        siteId
      )
    : [];
  // Filter out zero-value orders
  const displayOrders = monthlyOrders.filter((order: any) => {
    const total = Number(order?.total) || 0;
    return total > 0;
  });
  const monthLabel = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(
    2,
    "0"
  )}`;
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const canDownload = monthStart < currentMonthStart;
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

  return (
    <main>
      <TopNav title="Одиторски файл" />
      <div className="container">
        <section className="hero">
          <div>
            <h1>Месечни одиторски файлове за НАП.</h1>
            <p>
              Тук виждате всички поръчки, които влизат в месечния XML файл за
              одит, както и самия файл за изтегляне.
            </p>
            <MonthFilter
              value={monthLabel}
              options={monthOptions}
              label="Месец"
            />
            <div className="status-grid">
              <div className="status-card">
                <span>Период</span>
                <strong>{monthLabel}</strong>
                <span className="status-meta">Месечен диапазон</span>
              </div>
              <div className="status-card">
                <span>Поръчки в отчета</span>
                <strong>{displayOrders.length}</strong>
                <span className="status-meta">Платени в този месец с бележка</span>
              </div>
              <div className="status-card">
                <span>Файл за изтегляне</span>
                <strong>{canDownload ? "Готов" : "Недостъпен"}</strong>
                {canDownload ? (
                  <a
                    className="status-link"
                    href={`/api/audit/monthly?month=${monthLabel}`}
                  >
                    Изтегли XML
                  </a>
                ) : (
                  <span className="status-meta">
                    Файлът се генерира след края на месеца.
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="hero-card">
            <h2>Какво влиза в одиторския файл</h2>
            <p>
              Платени поръчки с издадена електронна бележка влизат в секция „Продажби".
              Сторно бележките влизат в секция „Връщания" за месеца, в който са издадени.
            </p>
            <div className="grid">
              <div className="card">
                <h3>Поръчки</h3>
                <p>{displayOrders.length} включени в експорта.</p>
              </div>
              <div className="card">
                <h3>Бележки</h3>
                <p>Издават се автоматично при плащане.</p>
              </div>
              <div className="card">
                <h3>XML</h3>
                <p>Изтегляне по всяко време за счетоводството.</p>
              </div>
            </div>
          </div>
        </section>
        <section className="orders">
          <h2>Поръчки за избрания месец</h2>
          {displayOrders.length === 0 ? (
            <p>Няма поръчки за избрания период.</p>
          ) : (
            <div className="orders-table">
              <div className="orders-head">
                <span>Поръчка</span>
                <span>Платена на</span>
                <span>Общо</span>
                <span>Валута</span>
              </div>
              {displayOrders.map((order) => (
                <div className="orders-row" key={order.id}>
                  <span>{order.number || order.id}</span>
                  <span>
                    {order.paid_at
                      ? new Date(order.paid_at).toLocaleString("bg-BG", {
                          timeZone: "Europe/Sofia",
                        })
                      : "—"}
                  </span>
                  <span>{formatMoney(order.total, order.currency)}</span>
                  <span>{order.currency || "—"}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
