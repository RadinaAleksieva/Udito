"use client";

import { useState } from "react";

const RETURN_PAYMENT_TYPES = [
  { value: 1, label: "В брой" },
  { value: 2, label: "По банкова сметка" },
  { value: 3, label: "Друга форма на плащане" },
  { value: 4, label: "Друго" },
];

type Props = {
  receiptId: number;
  currentType: number;
};

export default function ReturnPaymentEditor({ receiptId, currentType }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedType, setSelectedType] = useState(currentType || 2);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentLabel = RETURN_PAYMENT_TYPES.find(t => t.value === currentType)?.label || "По банкова сметка";

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/receipts/return-type", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId, returnPaymentType: selectedType }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || "Грешка при запазване");
        return;
      }

      // Reload page to show updated value
      window.location.reload();
    } catch (e) {
      setError("Грешка при връзка със сървъра");
    } finally {
      setSaving(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="return-payment-info">
        <span className="return-payment-label">Начин на връщане:</span>
        <span className="return-payment-value">{currentLabel}</span>
        <button
          type="button"
          className="btn-edit-return"
          onClick={() => setIsEditing(true)}
        >
          Коригирай
        </button>
      </div>
    );
  }

  return (
    <div className="return-payment-editor">
      <label className="return-payment-label">Начин на връщане:</label>
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(Number(e.target.value))}
        disabled={saving}
        className="return-payment-select"
      >
        {RETURN_PAYMENT_TYPES.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
      <div className="return-payment-actions">
        <button
          type="button"
          className="btn-save-return"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Запазване..." : "Запази"}
        </button>
        <button
          type="button"
          className="btn-cancel-return"
          onClick={() => {
            setIsEditing(false);
            setSelectedType(currentType || 2);
            setError(null);
          }}
          disabled={saving}
        >
          Отказ
        </button>
      </div>
      {error && <p className="return-payment-error">{error}</p>}
    </div>
  );
}
