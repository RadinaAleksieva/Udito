"use client";

import { useState } from "react";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function ConnectionCheck() {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleCheck() {
    setLoading(true);
    setStatus("");
    try {
      const instanceId = readCookie("udito_instance_id");
      if (!instanceId) {
        setStatus("Липсва код за достъп. Влезте през Wix или въведете код.");
        return;
      }
      const response = await fetch("/api/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
      const data = await response.json();
      if (!data?.ok) {
        throw new Error(
          data?.error || "Не е намерен сайт за този код. Отворете приложението от Wix."
        );
      }
      setStatus("Връзката е активна. Презареждане...");
      window.location.reload();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Грешка при проверка на връзката."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="status-action">
      <button
        type="button"
        className="status-link"
        onClick={handleCheck}
        disabled={loading}
      >
        {loading ? "Проверка..." : "Провери връзката"}
      </button>
      {status ? <span className="status-meta">{status}</span> : null}
    </div>
  );
}
