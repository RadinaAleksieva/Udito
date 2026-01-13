"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ReceiptDetail = {
  receiptId: number;
  orderNumber: string;
  customerName: string;
  total: number;
  paymentMethod: string;
  paymentMethodKey: string;
  issuedAt: string;
};

type RefundDetail = {
  receiptId: number;
  orderNumber: string;
  customerName: string;
  amount: number;
  issuedAt: string;
};

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
  receipts: ReceiptDetail[];
  refunds: RefundDetail[];
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [stats, setStats] = useState<MonthlyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const currentDate = new Date();

  // Read from URL params, fallback to current month
  const selectedYear = parseInt(searchParams.get("year") || String(currentDate.getFullYear()));
  const selectedMonth = parseInt(searchParams.get("month") || String(currentDate.getMonth() + 1));
  const storeParam = searchParams.get("store");

  // Update URL when selection changes
  const updateSelection = (year: number, month: number) => {
    const params = new URLSearchParams();
    params.set("year", String(year));
    params.set("month", String(month));
    if (storeParam) {
      params.set("store", storeParam);
    }
    router.push(`/reports?${params.toString()}`);
  };

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      setError(null);
      setExpandedSection(null);
      try {
        let url = `/api/reports/monthly?year=${selectedYear}&month=${selectedMonth}`;
        if (storeParam) {
          url += `&store=${encodeURIComponent(storeParam)}`;
        }
        const response = await fetch(url);
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
  }, [selectedYear, selectedMonth, storeParam]);

  // Generate year options (current year and 2 years back)
  const years = [currentDate.getFullYear(), currentDate.getFullYear() - 1, currentDate.getFullYear() - 2];

  // Filter receipts by payment method
  const getReceiptsByMethod = (methodKey: string) => {
    if (!stats?.receipts) return [];
    return stats.receipts.filter(r => r.paymentMethodKey === methodKey);
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  return (
    <main className="reports-page">
      <div className="page-header">
        <h1>Отчети</h1>
        <p>{MONTHS[selectedMonth - 1]} {selectedYear}</p>
      </div>

      {/* Month/Year Selector */}
      <div className="reports-filters">
        <div className="reports-filters__group">
          <label htmlFor="month-select">Месец</label>
          <select
            id="month-select"
            value={selectedMonth}
            onChange={(e) => updateSelection(selectedYear, parseInt(e.target.value))}
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
            onChange={(e) => updateSelection(parseInt(e.target.value), selectedMonth)}
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
          {/* Final Revenue - Big and Prominent */}
          <div className="final-revenue-card">
            <span className="final-revenue-card__label">Финален оборот</span>
            <span className="final-revenue-card__value">{formatMoney(stats.finalRevenue, stats.currency)}</span>
            <span className="final-revenue-card__sub">{stats.totalReceipts} бележки • {MONTHS[selectedMonth - 1]} {selectedYear}</span>
          </div>

          {/* Stats Grid */}
          <div className="stats-row">
            <div className="stat-item">
              <span className="stat-item__label">Общ оборот</span>
              <span className="stat-item__value">{formatMoney(stats.totalRevenue, stats.currency)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-item__label">Нето (без ДДС)</span>
              <span className="stat-item__value">{formatMoney(stats.netRevenue, stats.currency)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-item__label">ДДС (20%)</span>
              <span className="stat-item__value">{formatMoney(stats.totalTax, stats.currency)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-item__label">Средна поръчка</span>
              <span className="stat-item__value">{formatMoney(stats.avgOrderValue, stats.currency)}</span>
            </div>
          </div>

          {/* Additional Info */}
          <div className="stats-row stats-row--secondary">
            <div className="stat-item stat-item--small">
              <span className="stat-item__label">Доставки</span>
              <span className="stat-item__value">{formatMoney(stats.totalShipping, stats.currency)}</span>
            </div>
            {stats.totalDiscounts > 0 && (
              <div className="stat-item stat-item--small">
                <span className="stat-item__label">Отстъпки</span>
                <span className="stat-item__value stat-item__value--red">-{formatMoney(stats.totalDiscounts, stats.currency)}</span>
              </div>
            )}
          </div>

          {/* Payment Methods - Clickable Cards */}
          <section className="reports-section">
            <h2>По метод на плащане</h2>
            <div className="expandable-list">
              {stats.paymentMethods.map((pm) => (
                <div key={pm.method} className="expandable-group">
                  <button
                    className={`expandable-card ${expandedSection === pm.method ? 'expandable-card--expanded' : ''}`}
                    onClick={() => toggleSection(pm.method)}
                  >
                    <div className="expandable-card__info">
                      <span className="expandable-card__label">{pm.label}</span>
                      <span className="expandable-card__count">{pm.count} {pm.count === 1 ? 'бележка' : 'бележки'}</span>
                    </div>
                    <div className="expandable-card__amount">
                      {formatMoney(pm.amount, stats.currency)}
                    </div>
                    <span className="expandable-card__arrow">
                      {expandedSection === pm.method ? '▲' : '▼'}
                    </span>
                  </button>

                  {expandedSection === pm.method && (
                    <div className="expandable-content">
                      <table>
                        <thead>
                          <tr>
                            <th>Дата</th>
                            <th>Поръчка</th>
                            <th>Клиент</th>
                            <th>Сума</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getReceiptsByMethod(pm.method).map((receipt) => (
                            <tr key={receipt.receiptId}>
                              <td>{formatDate(receipt.issuedAt)}</td>
                              <td>#{receipt.orderNumber}</td>
                              <td>{receipt.customerName}</td>
                              <td>{formatMoney(receipt.total, stats.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}

              {/* Refunds Section */}
              {stats.totalRefunds > 0 && (
                <div className="expandable-group">
                  <button
                    className={`expandable-card expandable-card--refund ${expandedSection === 'refunds' ? 'expandable-card--expanded' : ''}`}
                    onClick={() => toggleSection('refunds')}
                  >
                    <div className="expandable-card__info">
                      <span className="expandable-card__label">Сторно</span>
                      <span className="expandable-card__count">{stats.totalRefunds} {stats.totalRefunds === 1 ? 'бележка' : 'бележки'}</span>
                    </div>
                    <div className="expandable-card__amount expandable-card__amount--red">
                      -{formatMoney(stats.refundAmount, stats.currency)}
                    </div>
                    <span className="expandable-card__arrow">
                      {expandedSection === 'refunds' ? '▲' : '▼'}
                    </span>
                  </button>

                  {expandedSection === 'refunds' && (
                    <div className="expandable-content">
                      <table>
                        <thead>
                          <tr>
                            <th>Дата</th>
                            <th>Поръчка</th>
                            <th>Клиент</th>
                            <th>Сума</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.refunds.map((refund) => (
                            <tr key={refund.receiptId}>
                              <td>{formatDate(refund.issuedAt)}</td>
                              <td>#{refund.orderNumber}</td>
                              <td>{refund.customerName}</td>
                              <td className="amount-red">-{formatMoney(refund.amount, stats.currency)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

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
