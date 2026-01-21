"use client";

import { useState } from "react";
import ReturnPaymentEditor from "./return-payment-editor";
import CancelReceiptButton from "./cancel-receipt-button";

type Props = {
  orderId: string;
  receiptId: number | null;
  receiptType: string;
  storeId: string;
  returnPaymentType?: number | null;
  referenceReceiptId?: number | null;
};

export default function PdfViewer({
  orderId,
  receiptId,
  receiptType,
  storeId,
  returnPaymentType,
  referenceReceiptId,
}: Props) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isRefund = receiptType === "refund";

  // Add PDF viewer parameters to hide sidebar and set reasonable zoom
  const pdfUrl = `/api/receipts/pdf?orderId=${orderId}&type=${receiptType}&store=${storeId}&inline=true#navpanes=0&zoom=90`;
  const downloadUrl = `/api/receipts/pdf?orderId=${orderId}&type=${receiptType}&store=${storeId}`;

  return (
    <div className="pdf-viewer-container">
      <div className="pdf-viewer-actions">
        <a className="receipt-button" href="/receipts">
          ← Назад
        </a>
        <a
          className="receipt-button primary"
          href={downloadUrl}
          download={`belezhka-${receiptId || orderId}.pdf`}
        >
          Изтегли PDF
        </a>
      </div>

      {/* Refund-specific controls */}
      {isRefund && receiptId && (
        <div className="refund-controls">
          <ReturnPaymentEditor
            receiptId={receiptId}
            currentType={returnPaymentType ?? 2}
          />
        </div>
      )}

      <div className="pdf-viewer-frame">
        {isLoading && (
          <div className="pdf-loading">
            <div className="pdf-spinner"></div>
            <p>Зареждане на бележката...</p>
          </div>
        )}
        {error && (
          <div className="pdf-error">
            <p>Грешка при зареждане: {error}</p>
            <a href={downloadUrl} className="receipt-button primary">
              Изтегли директно
            </a>
          </div>
        )}
        <iframe
          src={pdfUrl}
          className="pdf-iframe"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setError("Неуспешно зареждане на PDF");
          }}
          title="Преглед на бележка"
        />
      </div>

      {/* Cancel Receipt Button - shown below PDF */}
      {receiptId && (
        <div className="receipt-cancel-section">
          <CancelReceiptButton
            receiptId={receiptId}
            receiptType={receiptType}
            orderId={orderId}
            storeId={storeId}
          />
        </div>
      )}

      <style jsx>{`
        .pdf-viewer-container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 16px;
        }

        .pdf-viewer-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .receipt-button {
          display: inline-flex;
          align-items: center;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          text-decoration: none;
          background: #f3f4f6;
          color: #374151;
          transition: all 0.2s;
        }

        .receipt-button:hover {
          background: #e5e7eb;
        }

        .receipt-button.primary {
          background: #2563eb;
          color: white;
        }

        .receipt-button.primary:hover {
          background: #1d4ed8;
        }

        .refund-controls {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 20px;
        }

        .pdf-viewer-frame {
          position: relative;
          width: 100%;
          height: calc(100vh - 200px);
          min-height: 600px;
          background: #f9fafb;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .pdf-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }

        .pdf-loading,
        .pdf-error {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          z-index: 10;
        }

        .pdf-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #e5e7eb;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 12px;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .pdf-error {
          color: #dc2626;
        }

        .pdf-error .receipt-button {
          margin-top: 12px;
        }

        .receipt-cancel-section {
          margin-top: 24px;
          padding: 20px;
          background: var(--bg-secondary, #1a1a2e);
          border-radius: 12px;
          border: 1px solid var(--border-color, #2d2d44);
        }

        .receipt-cancel-section :global(.cancel-section) {
          display: flex;
          justify-content: flex-start;
        }

        .receipt-cancel-section :global(.receipt-button.danger) {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 14px;
          border: 1px solid rgba(239, 68, 68, 0.3);
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          cursor: pointer;
          transition: all 0.2s;
        }

        .receipt-cancel-section :global(.receipt-button.danger:hover) {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.5);
        }

        .receipt-cancel-section :global(.receipt-button.danger:disabled) {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .receipt-cancel-section :global(.confirm-overlay) {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .receipt-cancel-section :global(.confirm-dialog) {
          background: var(--bg-secondary, #1a1a2e);
          border: 1px solid var(--border-color, #2d2d44);
          border-radius: 16px;
          padding: 24px;
          max-width: 400px;
          width: 90%;
        }

        .receipt-cancel-section :global(.confirm-dialog h3) {
          margin: 0 0 12px;
          font-size: 18px;
          color: var(--text-primary, #fff);
        }

        .receipt-cancel-section :global(.confirm-dialog p) {
          margin: 0 0 16px;
          color: var(--text-secondary, #a0a0b0);
          font-size: 14px;
          line-height: 1.5;
        }

        .receipt-cancel-section :global(.confirm-warning) {
          color: #f59e0b !important;
          background: rgba(245, 158, 11, 0.1);
          padding: 12px;
          border-radius: 8px;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .receipt-cancel-section :global(.confirm-actions) {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }

        .receipt-cancel-section :global(.confirm-actions .receipt-button) {
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid var(--border-color, #2d2d44);
          background: var(--bg-tertiary, #252540);
          color: var(--text-primary, #fff);
        }

        .receipt-cancel-section :global(.confirm-actions .receipt-button:hover) {
          background: var(--bg-hover, #2d2d50);
        }

        .receipt-cancel-section :global(.confirm-actions .receipt-button.danger) {
          background: #ef4444;
          border-color: #ef4444;
          color: white;
        }

        .receipt-cancel-section :global(.confirm-actions .receipt-button.danger:hover) {
          background: #dc2626;
          border-color: #dc2626;
        }
      `}</style>
    </div>
  );
}
