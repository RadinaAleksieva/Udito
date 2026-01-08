"use client";

import { useEffect, useState } from "react";

type ReceiptSettingsState = {
  receiptNumberStart: string;
  codReceiptsEnabled: boolean;
};

const emptyForm: ReceiptSettingsState = {
  receiptNumberStart: "",
  codReceiptsEnabled: false,
};

export default function ReceiptSettingsForm() {
  const [form, setForm] = useState<ReceiptSettingsState>(emptyForm);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/receipts/settings");
        const data = await response.json();
        if (!cancelled && data?.ok && data?.settings) {
          setForm({
            receiptNumberStart: data.settings.receiptNumberStart?.toString() || "",
            codReceiptsEnabled: data.settings.codReceiptsEnabled || false,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("Грешка при зареждане на настройките.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/receipts/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptNumberStart: form.receiptNumberStart ? Number(form.receiptNumberStart) : null,
          codReceiptsEnabled: form.codReceiptsEnabled,
        }),
      });
      const data = await response.json();
      if (!data?.ok) {
        throw new Error(data?.error || "Неуспешен запис.");
      }
      setStatus("Настройките са записани.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Грешка при запис. Опитайте отново."
      );
    } finally {
      setLoading(false);
    }
  }

  function formatPreview(value: string): string {
    if (!value) return "0000000001";
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return "0000000001";
    return String(num).padStart(10, "0");
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="form-header">
        <div>
          <h2>Настройки на касовите бележки</h2>
          <p>Задайте начален номер и други опции за издаване на бележки.</p>
        </div>
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Запис..." : "Запази"}
        </button>
      </div>

      {status ? <p className="form-status">{status}</p> : null}

      <section className="settings-section">
        <div className="settings-section__header">
          <h3>Номерация на бележки</h3>
          <p>
            Бележките се номерират автоматично с 10-цифрен номер (0000000001).
            Ако вече сте издавали бележки от друга система, може да зададете
            начален номер, за да продължите своята номерация.
          </p>
        </div>
        <div className="form-grid">
          <label>
            Начален номер на бележка
            <input
              type="number"
              min="1"
              step="1"
              value={form.receiptNumberStart}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, receiptNumberStart: event.target.value }))
              }
              placeholder="Оставете празно за номерация от 1"
            />
            <span className="input-hint">
              Следващата бележка ще бъде с номер: <strong>{formatPreview(form.receiptNumberStart)}</strong>
            </span>
          </label>
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section__header">
          <h3>Наложен платеж (COD)</h3>
          <p>
            Изберете дали да се издават електронни бележки за поръчки,
            платени с наложен платеж. При наложен платеж обикновено бележката
            се издава от куриера, но ако желаете, можете да издавате и
            електронни бележки от UDITO.
          </p>
        </div>
        <div className="toggle-option">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={form.codReceiptsEnabled}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, codReceiptsEnabled: event.target.checked }))
              }
            />
            <span className="toggle-text">
              Издавай електронни бележки за поръчки с наложен платеж
            </span>
          </label>
          <span className="input-hint">
            По подразбиране бележки не се издават за наложен платеж.
          </span>
        </div>
      </section>

      <section className="settings-section settings-section--info">
        <div className="settings-section__header">
          <h3>Важни правила</h3>
        </div>
        <ul className="info-list">
          <li>
            <strong>Продукти с нулева стойност</strong> — не се издава бележка,
            дори ако поръчката е маркирана като платена.
          </li>
          <li>
            <strong>Връщания и рефънди</strong> — при връщане на продукт се издава
            отрицателна (сторнираща) бележка автоматично.
          </li>
          <li>
            <strong>Стари поръчки</strong> — не може да се издават бележки за
            поръчки, направени преди регистрацията на магазина в системата.
          </li>
        </ul>
      </section>
    </form>
  );
}
