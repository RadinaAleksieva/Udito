"use client";

import { useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

type Props = {
  orderId: string;
  receiptType: string;
  receiptId: number | null;
};

export default function ReceiptActions({ orderId, receiptType, receiptId }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDownload = async () => {
    const receiptElement = document.querySelector(".receipt") as HTMLElement;
    if (!receiptElement) {
      alert("Бележката не е намерена");
      return;
    }

    setDownloading(true);
    try {
      // Hide action buttons temporarily
      const actionsEl = document.querySelector(".receipt-actions") as HTMLElement;
      if (actionsEl) actionsEl.style.display = "none";

      const canvas = await html2canvas(receiptElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });

      // Restore action buttons
      if (actionsEl) actionsEl.style.display = "";

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;

      pdf.addImage(imgData, "PNG", imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`belezhka-${receiptId || orderId}.pdf`);
    } catch (error) {
      console.error("PDF generation error:", error);
      // Fallback to print
      window.print();
    } finally {
      setDownloading(false);
    }
  };

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
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? "Генериране..." : "Изтегли PDF"}
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
