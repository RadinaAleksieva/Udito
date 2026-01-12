"use client";

type Props = {
  orderId: string;
  receiptId: number | null;
  receiptType: string;
};

export default function ReceiptActions({ orderId, receiptId, receiptType }: Props) {
  const pdfUrl = `/api/receipts/pdf?orderId=${orderId}&type=${receiptType}`;

  return (
    <div className="receipt-actions">
      <a className="receipt-button" href="/receipts">
        Назад
      </a>
      <a
        className="receipt-button primary"
        href={pdfUrl}
        download={`belezhka-${receiptId || orderId}.pdf`}
      >
        Изтегли PDF
      </a>
    </div>
  );
}
