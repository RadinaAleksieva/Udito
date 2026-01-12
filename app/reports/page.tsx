"use client";

import { useEffect, useState } from "react";

type MonthlyStats = {
  year: number;
  month: number;
  totalReceipts: number;
  totalRevenue: number;
  totalTax: number;
  totalShipping: number;
  totalDiscounts: number;
  avgOrderValue: number;
  netRevenue: number;
  totalRefunds: number;
  refundAmount: number;
  finalRevenue: number;
  paymentMethods: Array<{
    method: string;
    count: number;
    amount: number;
  }>;
  dailyBreakdown: Array<{
    date: string;
    receipts: number;
    revenue: number;
  }>;
};

const MONTHS = [
  "Януари", "Февруари", "Март", "Април", "Май", "Юни",
  "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"
];

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatPaymentMethod(method: string): string {
  const methods: Record<string, string> = {
    creditCard: "Карта",
    offline: "Наложен платеж",
    payPal: "PayPal",
    unknown: "Неизвестен",
  };
  return methods[method] || method;
}

export default function ReportsPage() {
  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/reports/monthly?year=${selectedYear}&month=${selectedMonth}`
        );
        const data = await response.json();
        if (data.ok) {
          setStats(data.stats);
        } else {
          setError(data.error || "Грешка при зареждане на статистиките");
        }
      } catch (err) {
        setError("Грешка при зареждане на статистиките");
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [selectedYear, selectedMonth]);

  // Generate year options (current year and 2 years back)
  const years = [currentDate.getFullYear(), currentDate.getFullYear() - 1, currentDate.getFullYear() - 2];

  return (
    <main className="reports-page">
      <div className="page-header">
        <h1>Отчети</h1>
        <p>Месечна статистика за продажбите</p>
      </div>

      {/* Month/Year Selector */}
      <div className="reports-filters">
        <div className="reports-filters__group">
          <label htmlFor="month-select">Месец</label>
          <select
            id="month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="reports-select"
          >
            {MONTHS.map((name, idx) => (
              <option key={idx} value={idx + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div className="reports-filters__group">
          <label htmlFor="year-select">Година</label>
          <select
            id="year-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="reports-select"
          >
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="reports-loading">
          <p>Зареждане...</p>
        </div>
      )}

      {error && (
        <div className="reports-error">
          <p>{error}</p>
        </div>
      )}

      {stats && !loading && (
        <>
          {/* Main Stats Grid */}
          <div className="stats-grid">
            <div className="stat-card stat-card--primary">
              <div className="stat-card__label">Общ оборот</div>
              <div className="stat-card__value">{formatMoney(stats.totalRevenue)}</div>
              <div className="stat-card__sub">
                {stats.totalReceipts} бележки
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card__label">Нето (без ДДС)</div>
              <div className="stat-card__value">{formatMoney(stats.netRevenue)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-card__label">ДДС (20%)</div>
              <div className="stat-card__value">{formatMoney(stats.totalTax)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-card__label">Средна поръчка</div>
              <div className="stat-card__value">{formatMoney(stats.avgOrderValue)}</div>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="stats-grid stats-grid--secondary">
            <div className="stat-card">
              <div className="stat-card__label">Доставки</div>
              <div className="stat-card__value">{formatMoney(stats.totalShipping)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-card__label">Отстъпки</div>
              <div className="stat-card__value stat-card__value--discount">
                -{formatMoney(stats.totalDiscounts)}
              </div>
            </div>

            <div className="stat-card stat-card--warning">
              <div className="stat-card__label">Сторно бележки</div>
              <div className="stat-card__value">{stats.totalRefunds}</div>
              <div className="stat-card__sub">
                -{formatMoney(stats.refundAmount)}
              </div>
            </div>

            <div className="stat-card stat-card--success">
              <div className="stat-card__label">Финален оборот</div>
              <div className="stat-card__value">{formatMoney(stats.finalRevenue)}</div>
              <div className="stat-card__sub">След сторно</div>
            </div>
          </div>

          {/* Payment Methods Breakdown */}
          {stats.paymentMethods.length > 0 && (
            <section className="reports-section">
              <h2>По метод на плащане</h2>
              <div className="payment-methods-table">
                <table>
                  <thead>
                    <tr>
                      <th>Метод</th>
                      <th>Бележки</th>
                      <th>Сума</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.paymentMethods.map((pm) => (
                      <tr key={pm.method}>
                        <td>{formatPaymentMethod(pm.method)}</td>
                        <td>{pm.count}</td>
                        <td>{formatMoney(pm.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Daily Breakdown */}
          {stats.dailyBreakdown.length > 0 && (
            <section className="reports-section">
              <h2>По дни</h2>
              <div className="daily-breakdown">
                <div className="daily-chart">
                  {stats.dailyBreakdown.map((day) => {
                    const maxRevenue = Math.max(...stats.dailyBreakdown.map(d => d.revenue));
                    const heightPercent = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
                    const date = new Date(day.date);
                    return (
                      <div key={day.date} className="daily-chart__bar-container">
                        <div
                          className="daily-chart__bar"
                          style={{ height: `${Math.max(heightPercent, 2)}%` }}
                          title={`${formatMoney(day.revenue)} (${day.receipts} бел.)`}
                        />
                        <div className="daily-chart__label">{date.getDate()}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {/* Empty State */}
          {stats.totalReceipts === 0 && (
            <div className="reports-empty">
              <p>Няма издадени бележки за {MONTHS[selectedMonth - 1]} {selectedYear}</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
