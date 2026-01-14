"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import TopNavClient from "../components/top-nav-client";
import Link from "next/link";

type Member = {
  id: number;
  userId: string | null;
  email: string | null;
  name: string;
  image: string | null;
  role: string;
  hasAccessCode: boolean;
  accessCodeExpiresAt: string | null;
  connectedAt: string;
  isCurrentUser: boolean;
};

type AccessData = {
  members: Member[];
  currentUserRole: string;
  canManage: boolean;
  totalMembers: number;
  maxMembers: number;
};

export default function AccessPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [accessData, setAccessData] = useState<AccessData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated") {
      fetchAccessData();
    }
  }, [status, router]);

  async function fetchAccessData() {
    try {
      const response = await fetch("/api/access/list");
      const data = await response.json();
      if (data.ok !== false) {
        setAccessData(data);
      } else {
        setError(data.error || "Грешка при зареждане");
      }
    } catch (err) {
      setError("Грешка при свързване със сървъра");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleGenerateCode() {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/access/generate-code", { method: "POST" });
      const data = await response.json();
      if (data.ok) {
        setGeneratedCode(data.accessCode);
        fetchAccessData(); // Refresh the list
      } else {
        setError(data.error || "Грешка при генериране на код");
      }
    } catch (err) {
      setError("Грешка при свързване със сървъра");
    } finally {
      setIsGenerating(false);
    }
  }

  function copyCode() {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode);
    }
  }

  function getRoleLabel(role: string): string {
    switch (role) {
      case "owner":
        return "Собственик";
      case "admin":
        return "Администратор";
      case "accountant":
        return "Счетоводител";
      default:
        return "Член";
    }
  }

  function getRoleBadgeClass(role: string): string {
    switch (role) {
      case "owner":
        return "access-role--owner";
      case "admin":
        return "access-role--admin";
      case "accountant":
        return "access-role--accountant";
      default:
        return "";
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <main>
        <TopNavClient title="Управление на достъпа" />
        <div className="container">
          <div className="billing-loading">
            <div className="login-spinner"></div>
            <p>Зареждане...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <TopNavClient title="Управление на достъпа" />
      <div className="container">
        <section className="access-header">
          <h1>Управление на достъпа</h1>
          <p>
            Управлявайте кой има достъп до вашия магазин.
            Можете да добавите до {accessData?.maxMembers || 3} профила.
          </p>
        </section>

        {error && (
          <div className="access-error">
            <p>{error}</p>
          </div>
        )}

        <section className="access-members">
          <div className="access-section-header">
            <h2>Потребители с достъп ({accessData?.totalMembers || 0}/{accessData?.maxMembers || 3})</h2>
          </div>

          <div className="access-list">
            {accessData?.members.map((member) => (
              <div key={member.id} className={`access-member ${member.isCurrentUser ? "access-member--current" : ""}`}>
                <div className="access-member__avatar">
                  {member.image ? (
                    <img src={member.image} alt={member.name} />
                  ) : (
                    <span>{member.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="access-member__info">
                  <div className="access-member__name">
                    {member.name}
                    {member.isCurrentUser && <span className="access-member__you">(Вие)</span>}
                  </div>
                  <div className="access-member__email">{member.email || "—"}</div>
                </div>
                <div className={`access-role ${getRoleBadgeClass(member.role)}`}>
                  {getRoleLabel(member.role)}
                </div>
                {member.hasAccessCode && !member.userId && (
                  <div className="access-pending">
                    <span className="access-pending__badge">Очаква потвърждение</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {accessData?.canManage && (
          <section className="access-invite">
            <h2>Добави счетоводител</h2>
            <p>
              Генерирайте код за достъп, който да дадете на вашия счетоводител.
              Кодът е валиден 30 дни и дава само read-only достъп.
            </p>

            {generatedCode ? (
              <div className="access-code-display">
                <div className="access-code-value">{generatedCode}</div>
                <button className="access-code-copy" onClick={copyCode}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  Копирай
                </button>
                <p className="access-code-hint">
                  Дайте този код на вашия счетоводител. Той трябва да влезе в UDITO и да въведе кода от страницата за вход.
                </p>
              </div>
            ) : (
              <button
                className="access-generate-btn"
                onClick={handleGenerateCode}
                disabled={isGenerating || (accessData?.totalMembers || 0) >= (accessData?.maxMembers || 3)}
              >
                {isGenerating ? "Генериране..." : "Генерирай код за достъп"}
              </button>
            )}

            {(accessData?.totalMembers || 0) >= (accessData?.maxMembers || 3) && (
              <p className="access-limit-warning">
                Достигнахте максималния брой потребители ({accessData?.maxMembers}).
                Премахнете потребител, за да добавите нов.
              </p>
            )}
          </section>
        )}

        <div className="access-back">
          <Link href="/overview">← Назад към таблото</Link>
        </div>
      </div>
      <footer className="footer">UDITO от ДИЗАЙНС БАЙ ПО ЕООД</footer>
    </main>
  );
}
