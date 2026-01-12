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
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null);

  const currentDate = new Date();

  // Read from URL params, fallback to current month
  const selectedYear = parseInt(searchParams.get("year") || String(currentDate.getFullYear()));
  const selectedMonth = parseInt(searchParams.get("month") || String(currentDate.getMonth() + 1));

  // Update URL when selection changes
  const updateSelection = (year: number, month: number) => {
    const params = new URLSearchParams();
    params.set("year", String(year));
    params.set("month", String(month));
    router.push(`/reports?${params.toString()}`);
  };

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      setError(null);
      setExpandedMethod(null);
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

  // Filter receipts by payment method
  const getReceiptsByMethod = (methodKey: string) => {
    if (!stats?.receipts) return [];
    return stats.receipts.filter(r => r.paymentMethodKey === methodKey);
  };

  const toggleMethod = (method: string) => {
    setExpandedMethod(expandedMethod === method ? null : method);
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
          {/* Summary Cards */}
          <div className="report-summary">
            <div className="summary-card summary-card--primary">
              <span className="summary-card__label">Общ оборот</span>
              <span className="summary-card__value">{formatMoney(stats.totalRevenue, stats.currency)}</span>
              <span className="summary-card__sub">{stats.totalReceipts} бележки</span>
            </div>

            <div className="summary-card">
              <span className="summary-card__label">Нето (без ДДС)</span>
              <span className="summary-card__value">{formatMoney(stats.netRevenue, stats.currency)}</span>
            </div>

            <div className="summary-card">
              <span className="summary-card__label">ДДС (20%)</span>
              <span className="summary-card__value">{formatMoney(stats.totalTax, stats.currency)}</span>
            </div>

            <div className="summary-card">
              <span className="summary-card__label">Средна поръчка</span>
              <span className="summary-card__value">{formatMoney(stats.avgOrderValue, stats.currency)}</span>
            </div>
          </div>

          {/* Additional Stats Row */}
          <div className="report-details">
            <div className="detail-item">
              <span className="detail-item__label">Доставки</span>
              <span className="detail-item__value">{formatMoney(stats.totalShipping, stats.currency)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Отстъпки</span>
              <span className="detail-item__value detail-item__value--negative">-{formatMoney(stats.totalDiscounts, stats.currency)}</span>
            </div>
            {stats.totalRefunds > 0 && (
              <div className="detail-item detail-item--warning">
                <span className="detail-item__label">Сторно</span>
                <span className="detail-item__value">-{formatMoney(stats.refundAmount, stats.currency)}</span>
                <span className="detail-item__sub">{stats.totalRefunds} {stats.totalRefunds === 1 ? 'бележка' : 'бележки'}</span>
              </div>
            )}
            <div className="detail-item detail-item--success">
              <span className="detail-item__label">Финален оборот</span>
              <span className="detail-item__value">{formatMoney(stats.finalRevenue, stats.currency)}</span>
            </div>
          </div>

          {/* Payment Methods - Clickable Cards */}
          {stats.paymentMethods.length > 0 && (
            <section className="reports-section">
              <h2>По метод на плащане</h2>
              <div className="payment-methods">
                {stats.paymentMethods.map((pm) => (
                  <div key={pm.method} className="payment-method-group">
                    <button
                      className={`payment-method-card ${expandedMethod === pm.method ? 'payment-method-card--expanded' : ''}`}
                      onClick={() => toggleMethod(pm.method)}
                    >
                      <div className="payment-method-card__info">
                        <span className="payment-method-card__label">{pm.label}</span>
                        <span className="payment-method-card__count">{pm.count} {pm.count === 1 ? 'бележка' : 'бележки'}</span>
                      </div>
                      <div className="payment-method-card__amount">
                        {formatMoney(pm.amount, stats.currency)}
                      </div>
                      <span className="payment-method-card__arrow">
                        {expandedMethod === pm.method ? '▲' : '▼'}
                      </span>
                    </button>

                    {/* Expanded Receipts List */}
                    {expandedMethod === pm.method && (
                      <div className="payment-method-receipts">
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
              </div>
            </section>
          )}

          {/* All Receipts List */}
          {stats.receipts && stats.receipts.length > 0 && (
            <section className="reports-section">
              <h2>Всички бележки ({stats.receipts.length})</h2>
              <div className="all-receipts-table">
                <table>
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Поръчка</th>
                      <th>Клиент</th>
                      <th>Метод</th>
                      <th>Сума</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.receipts.map((receipt) => (
                      <tr key={receipt.receiptId}>
                        <td>{formatDate(receipt.issuedAt)}</td>
                        <td>#{receipt.orderNumber}</td>
                        <td>{receipt.customerName}</td>
                        <td>{receipt.paymentMethod}</td>
                        <td>{formatMoney(receipt.total, stats.currency)}</td>
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
