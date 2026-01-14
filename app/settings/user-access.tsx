"use client";

import { useState, useEffect } from "react";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  connected_at: string;
}

interface AccessCode {
  code: string;
  role: string;
  expires_at: string;
}

interface UserAccessProps {
  siteId: string | null;
  currentUserId: string;
  userRole: string;
}

export default function UserAccess({ siteId, currentUserId, userRole }: UserAccessProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [accessCode, setAccessCode] = useState<AccessCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  const isOwner = userRole === "owner";

  useEffect(() => {
    if (siteId) {
      loadUsers();
    } else {
      setIsLoading(false);
    }
  }, [siteId]);

  async function loadUsers() {
    try {
      const response = await fetch(`/api/stores/users?siteId=${siteId}`);
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users || []);
        setAccessCode(data.accessCode || null);
      }
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function generateCode() {
    setIsGenerating(true);
    setStatus("");
    try {
      const response = await fetch("/api/stores/access-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, role: "accountant" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Грешка при генериране на код");
      setAccessCode(data.accessCode);
      setStatus("Кодът е генериран успешно");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Грешка");
    } finally {
      setIsGenerating(false);
    }
  }

  async function removeUser(userId: string) {
    if (!confirm("Сигурни ли сте, че искате да премахнете този потребител?")) return;

    setRemovingUserId(userId);
    setStatus("");
    try {
      const response = await fetch("/api/stores/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Грешка при премахване");
      setUsers(users.filter((u) => u.id !== userId));
      setStatus("Потребителят е премахнат");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Грешка");
    } finally {
      setRemovingUserId(null);
    }
  }

  async function copyCode() {
    if (!accessCode) return;
    try {
      await navigator.clipboard.writeText(accessCode.code);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = accessCode.code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }

  if (!siteId) {
    return (
      <section className="settings-section">
        <h2>Достъп за счетоводители</h2>
        <p className="settings-hint">Свържете магазин, за да управлявате достъпа.</p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="settings-section">
        <h2>Достъп за счетоводители</h2>
        <p>Зареждане...</p>
      </section>
    );
  }

  return (
    <section className="settings-section">
      <h2>Достъп за счетоводители</h2>
      <p className="settings-hint">
        Генерирайте код за достъп, който да споделите с вашия счетоводител.
        Кодът дава само преглед на бележките и одиторските файлове.
      </p>

      {/* Access Code */}
      <div className="access-code-box">
        <div className="access-code-header">
          <h3>Код за достъп</h3>
          {isOwner && (
            <button
              className="btn-small btn-secondary"
              onClick={generateCode}
              disabled={isGenerating}
            >
              {isGenerating ? "Генериране..." : accessCode ? "Нов код" : "Генерирай код"}
            </button>
          )}
        </div>

        {accessCode ? (
          <div className="access-code-display">
            <code className="access-code">{accessCode.code}</code>
            <button className="btn-copy" onClick={copyCode} title="Копирай">
              {copySuccess ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              )}
            </button>
          </div>
        ) : (
          <p className="access-code-empty">Няма активен код. Генерирайте нов.</p>
        )}

        {accessCode && (
          <p className="access-code-expires">
            Валиден до: {new Date(accessCode.expires_at).toLocaleDateString("bg-BG")}
          </p>
        )}
      </div>

      {/* Users with access */}
      {users.length > 0 && (
        <div className="users-list">
          <h3>Потребители с достъп</h3>
          <div className="users-table">
            {users.map((user) => (
              <div key={user.id} className="user-row">
                <div className="user-info">
                  <span className="user-email">{user.email}</span>
                  <span className="user-role">
                    {user.role === "owner" && "Собственик"}
                    {user.role === "admin" && "Администратор"}
                    {user.role === "accountant" && "Счетоводител"}
                    {user.role === "member" && "Член"}
                  </span>
                </div>
                {isOwner && user.id !== currentUserId && user.role !== "owner" && (
                  <button
                    className="btn-small btn-danger"
                    onClick={() => removeUser(user.id)}
                    disabled={removingUserId === user.id}
                  >
                    {removingUserId === user.id ? "..." : "Премахни"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {status && (
        <p className={`settings-status ${status.includes("Грешка") ? "settings-status--error" : "settings-status--success"}`}>
          {status}
        </p>
      )}
    </section>
  );
}
