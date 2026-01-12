"use client";

import { useEffect, useState } from "react";

type MonthlyStats = {
  year: number;
  month: number;
  currency: string;
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
    label: string;
    count: number;
    amount: number;
  }>;
};

const MONTHS = [
  "Януари", "Февруари", "Март", "Април", "Май", "Юни",
  "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"
];

function formatMoney(amount: number, currency: string = "EUR"): string {
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 2,
  }).format(amount);
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
              <div className="stat-card__value">{formatMoney(stats.totalRevenue, stats.currency)}</div>
              <div className="stat-card__sub">
                {stats.totalReceipts} бележки
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card__label">Нето (без ДДС)</div>
              <div className="stat-card__value">{formatMoney(stats.netRevenue, stats.currency)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-card__label">ДДС (20%)</div>
              <div className="stat-card__value">{formatMoney(stats.totalTax, stats.currency)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-card__label">Средна поръчка</div>
              <div className="stat-card__value">{formatMoney(stats.avgOrderValue, stats.currency)}</div>
            </div>
          </div>

          {/* Secondary Stats */}
          <div className="stats-grid stats-grid--secondary">
            <div className="stat-card">
              <div className="stat-card__label">Доставки</div>
              <div className="stat-card__value">{formatMoney(stats.totalShipping, stats.currency)}</div>
            </div>

            <div className="stat-card">
              <div className="stat-card__label">Отстъпки</div>
              <div className="stat-card__value stat-card__value--discount">
                -{formatMoney(stats.totalDiscounts, stats.currency)}
              </div>
            </div>

            <div className="stat-card stat-card--warning">
              <div className="stat-card__label">Сторно бележки</div>
              <div className="stat-card__value">{stats.totalRefunds}</div>
              <div className="stat-card__sub">
                -{formatMoney(stats.refundAmount, stats.currency)}
              </div>
            </div>

            <div className="stat-card stat-card--success">
              <div className="stat-card__label">Финален оборот</div>
              <div className="stat-card__value">{formatMoney(stats.finalRevenue, stats.currency)}</div>
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
                        <td>{pm.label}</td>
                        <td>{pm.count}</td>
                        <td>{formatMoney(pm.amount, stats.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
