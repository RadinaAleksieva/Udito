"use client";

import { useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

type Props = {
  orderId: string;
  receiptId: number | null;
};

export default function ReceiptActions({ orderId, receiptId }: Props) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    const receiptElement = document.querySelector(".receipt") as HTMLElement;
    if (!receiptElement) {
      alert("Бележката не е намерена");
      return;
    }

    setDownloading(true);
    try {
      // Hide action buttons and remove border for clean PDF
      const actionsEl = document.querySelector(".receipt-actions") as HTMLElement;
      if (actionsEl) actionsEl.style.display = "none";
      const cancelEl = document.querySelector(".cancel-section") as HTMLElement;
      if (cancelEl) cancelEl.style.display = "none";

      const originalBorder = receiptElement.style.border;
      const originalBoxShadow = receiptElement.style.boxShadow;
      receiptElement.style.border = "none";
      receiptElement.style.boxShadow = "none";

      const canvas = await html2canvas(receiptElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: "#ffffff",
        removeContainer: true,
        imageTimeout: 5000,
      });

      // Restore action buttons and styles
      if (actionsEl) actionsEl.style.display = "";
      if (cancelEl) cancelEl.style.display = "";
      receiptElement.style.border = originalBorder;
      receiptElement.style.boxShadow = originalBoxShadow;

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

  return (
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
    </div>
  );
}
