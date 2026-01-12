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
          // Hide action buttons
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
          console.error("PDF download error:", error);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [enabled, triggered, receiptId, orderId]);

  return null;
}
