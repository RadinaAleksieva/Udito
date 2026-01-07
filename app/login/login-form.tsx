"use client";

import { useState } from "react";

export default function LoginForm() {
  const [instanceId, setInstanceId] = useState("");
  const [status, setStatus] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    try {
      const response = await fetch("/api/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: instanceId.trim(),
        }),
      });
      const data = await response.json();
      if (!data?.ok) {
        throw new Error(
          data?.error || "Не е намерен сайт за този код. Отворете приложението от Wix."
        );
      }
      setStatus("Успешно свързване. Пренасочване...");
      window.location.href = "/overview";
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Неуспешно свързване. Проверете данните."
      );
    }
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="form-header">
        <div>
          <h2>Вход с код за достъп</h2>
          <p>Въведете инстанс ID, за да достъпите магазина без Wix вход.</p>
          <p className="status-meta">
            Ако това е първо влизане, отворете приложението от Wix поне веднъж,
            за да се запише сайтът.
          </p>
        </div>
        <button className="btn-primary" type="submit">
          Влез
        </button>
      </div>
      {status ? <p className="form-status">{status}</p> : null}
      <div className="form-grid">
        <label>
          Код за достъп (Instance ID)
          <input
            value={instanceId}
            onChange={(event) => setInstanceId(event.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            required
          />
        </label>
      </div>
    </form>
  );
}
