"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export default function StoreConnectForm() {
  const router = useRouter();
  const [instanceId, setInstanceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Handle OAuth popup flow
  const handleOAuthConnect = useCallback(async () => {
    setOauthLoading(true);
    setError(null);
    setSuccess(false);

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      "/api/oauth/authorize",
      "wix-oauth",
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );

    if (!popup) {
      setError("Popup блокиран. Моля, разрешете popups за този сайт.");
      setOauthLoading(false);
      return;
    }

    // Poll for the access token in the popup URL
    const pollInterval = setInterval(async () => {
      try {
        // Check if popup is closed
        if (popup.closed) {
          clearInterval(pollInterval);
          setOauthLoading(false);
          return;
        }

        // Try to read the popup URL
        const popupUrl = popup.location.href;

        // Check if we're on the close-window page with access_token
        if (popupUrl.includes("close-window") && popupUrl.includes("access_token=")) {
          clearInterval(pollInterval);
          popup.close();

          // Extract access_token from URL
          const url = new URL(popupUrl);
          const accessToken = url.searchParams.get("access_token");

          if (accessToken) {
            // Send token to our callback endpoint
            const response = await fetch("/api/oauth/callback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accessToken }),
            });

            const data = await response.json();

            if (data.ok) {
              setSuccess(true);
              setTimeout(() => {
                router.refresh();
              }, 1500);
            } else {
              setError(data.error || "Грешка при свързване на магазина");
            }
          } else {
            setError("Не е получен токен от Wix");
          }
          setOauthLoading(false);
        }
      } catch {
        // Cross-origin error - popup is still on Wix domain
        // This is expected, just continue polling
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      if (!popup.closed) {
        popup.close();
      }
      setOauthLoading(false);
    }, 5 * 60 * 1000);
  }, [router]);

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
        Свържете нов Wix магазин към вашия акаунт.
      </p>

      {/* Primary method - OAuth via Wix */}
      <div className="connect-primary">
        <button
          onClick={handleOAuthConnect}
          disabled={oauthLoading}
          className="btn btn-primary btn-large"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 4v16m8-8H4" />
          </svg>
          {oauthLoading ? "Свързване..." : "Свържи през Wix"}
        </button>
        <p className="form-hint">
          Препоръчителен метод. Ще се отвори прозорец за оторизация през Wix.
        </p>
      </div>

      <div className="connect-divider">
        <span>или въведете код ръчно</span>
      </div>

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
          className="btn btn-secondary"
        >
          {loading ? "Свързване..." : "Свържи с код"}
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
