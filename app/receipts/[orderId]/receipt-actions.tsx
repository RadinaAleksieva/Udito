"use client";

export default function ReceiptActions() {
  return (
    <div className="receipt-actions">
      <a className="receipt-button" href="/receipts">
        Назад
      </a>
      <button className="receipt-button primary" onClick={() => window.print()}>
        Изтегли PDF
      </button>
    </div>
  );
}
