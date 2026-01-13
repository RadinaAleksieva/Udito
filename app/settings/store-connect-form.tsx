"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StoreConnectForm() {
  const router = useRouter();
  const [instanceId, setInstanceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    const trimmedId = instanceId.trim();
    if (!trimmedId) {
      setError("Моля, въведете Instance ID");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/stores/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: trimmedId }),
      });

      const data = await response.json();

      if (data.ok) {
        setSuccess(true);
        setInstanceId("");
        // Refresh the page to show the new store
        setTimeout(() => {
          router.refresh();
        }, 1500);
      } else {
        setError(data.error || "Грешка при свързване на магазина");
      }
    } catch (err) {
      setError("Грешка при свързване. Моля, опитайте отново.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="settings-section">
      <h2>Свържи нов магазин</h2>
      <p className="section-description">
        Въведете Instance ID от Wix, за да свържете нов магазин към вашия акаунт.
      </p>

      <form onSubmit={handleSubmit} className="store-connect-form">
        <div className="form-group">
          <label htmlFor="instanceId">Instance ID</label>
          <input
            type="text"
            id="instanceId"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
            placeholder="Въведете Instance ID от Wix"
            disabled={loading}
            className="form-input"
          />
          <p className="form-hint">
            Можете да намерите Instance ID в URL адреса, когато отворите UDITO от Wix Dashboard.
          </p>
        </div>

        {error && (
          <div className="form-error">
            {error}
          </div>
        )}

        {success && (
          <div className="form-success">
            Магазинът е свързан успешно! Страницата ще се обнови...
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !instanceId.trim()}
          className="btn btn-primary"
        >
          {loading ? "Свързване..." : "Свържи магазин"}
        </button>
      </form>

      <div className="help-box">
        <h3>Как да намеря Instance ID?</h3>
        <ol>
          <li>Отворете <strong>Wix Dashboard</strong> на магазина</li>
          <li>Отидете в <strong>Apps</strong> → <strong>UDITO</strong></li>
          <li>Копирайте <code>instance</code> параметъра от URL адреса</li>
        </ol>
        <p>
          Пример: <code>https://manage.wix.com/...?instance=<strong>abc123...</strong></code>
        </p>
      </div>
    </section>
  );
}
