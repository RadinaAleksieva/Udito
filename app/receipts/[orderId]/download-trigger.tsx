"use client";

import { useEffect, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

type Props = {
  enabled: boolean;
  receiptId: number | null;
  orderId: string;
};

export default function DownloadTrigger({ enabled, receiptId, orderId }: Props) {
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    if (enabled && !triggered) {
      const timer = setTimeout(async () => {
        setTriggered(true);
        const receiptElement = document.querySelector(".receipt") as HTMLElement;
        if (!receiptElement) return;

        try {
          // Hide action buttons and remove border for clean PDF
          const actionsEl = document.querySelector(".receipt-actions") as HTMLElement;
          if (actionsEl) actionsEl.style.display = "none";

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
          console.error("PDF download error:", error);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [enabled, triggered, receiptId, orderId]);

  return null;
}
