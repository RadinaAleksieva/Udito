"use client";

import { useState } from "react";

type Props = {
  orderId: string;
  receiptType: string;
  receiptId: number | null;
};

export default function ReceiptActions({ orderId, receiptType, receiptId }: Props) {
  const [canceling, setCanceling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCancel = async () => {
    if (!receiptId) return;

    setCanceling(true);
    try {
      const response = await fetch("/api/receipts/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId }),
      });

      const data = await response.json();

      if (!data.ok) {
        alert(data.error || "Грешка при анулиране");
        return;
      }

      // Redirect to receipts list after successful cancellation
      window.location.href = "/receipts";
    } catch (error) {
      console.error("Cancel error:", error);
      alert("Грешка при връзка със сървъра");
    } finally {
      setCanceling(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <div className="receipt-actions">
        <a className="receipt-button" href="/receipts">
          Назад
        </a>
        <button
          className="receipt-button primary"
          onClick={() => window.print()}
        >
          Изтегли PDF
        </button>
        {receiptId && (
          <button
            className="receipt-button danger"
            onClick={() => setShowConfirm(true)}
            disabled={canceling}
          >
            Анулирай
          </button>
        )}
      </div>

      {showConfirm && (
        <div className="confirm-overlay">
          <div className="confirm-dialog">
            <h3>Анулиране на бележка</h3>
            <p>
              Сигурни ли сте, че искате да анулирате тази бележка?
              Тя ще бъде изтрита от системата и няма да може да бъде възстановена.
            </p>
            {receiptType === "sale" && (
              <p className="confirm-warning">
                Внимание: Ако има сторно бележка към тази продажба, тя също ще бъде изтрита.
              </p>
            )}
            <div className="confirm-actions">
              <button
                className="receipt-button"
                onClick={() => setShowConfirm(false)}
                disabled={canceling}
              >
                Отказ
              </button>
              <button
                className="receipt-button danger"
                onClick={handleCancel}
                disabled={canceling}
              >
                {canceling ? "Анулиране..." : "Да, анулирай"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
