"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [hasCompanyData, setHasCompanyData] = useState(false);

  // Form fields
  const [companyName, setCompanyName] = useState("");
  const [eik, setEik] = useState("");
  const [napStoreNumber, setNapStoreNumber] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated" && session?.user) {
      // Check if user already has company data
      checkCompanyData();
    }
  }, [status, session, router]);

  async function checkCompanyData() {
    try {
      const response = await fetch("/api/onboarding/check");
      const data = await response.json();

      if (data.hasCompanyData) {
        // User already has company data, redirect to overview
        setHasCompanyData(true);
        router.push("/overview");
      } else {
        // Pre-fill with existing data if available
        if (data.companyName) setCompanyName(data.companyName);
        if (data.eik) setEik(data.eik);
        if (data.napStoreNumber) setNapStoreNumber(data.napStoreNumber);
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Error checking company data:", error);
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage("");

    if (!companyName.trim()) {
      setStatusMessage("Моля въведете име на фирмата");
      return;
    }

    if (!eik.trim() || eik.trim().length !== 9) {
      setStatusMessage("Моля въведете валиден ЕИК (9 цифри)");
      return;
    }

    if (!napStoreNumber.trim()) {
      setStatusMessage("Моля въведете номер на обект в НАП");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          eik: eik.trim(),
          napStoreNumber: napStoreNumber.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Грешка при запис на данните");
      }

      setStatusMessage("Данните са запазени успешно! Пренасочване...");
      setTimeout(() => {
        router.push("/overview");
      }, 1000);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Възникна грешка. Опитайте отново."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (status === "loading" || isLoading || hasCompanyData) {
    return (
      <main className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-logo">
              <img src="/brand/udito-logo.png" alt="UDITO" />
            </div>
            <h1>Зареждане...</h1>
            <div className="login-auto-connect">
              <div className="login-spinner"></div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="login-page">
      <div className="login-container">
        <div className="login-card">
          <Link href="/" className="login-logo">
            <img src="/brand/udito-logo.png" alt="UDITO" />
          </Link>

          <h1>Добре дошли в UDITO!</h1>
          <p className="login-subtitle">
            За да използвате приложението, моля въведете данните на вашата фирма.
          </p>

          <form className="login-email-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Име на фирмата"
              required
              disabled={isSaving}
            />
            <input
              type="text"
              value={eik}
              onChange={(e) => setEik(e.target.value.replace(/\D/g, ""))}
              placeholder="ЕИК (9 цифри)"
              required
              disabled={isSaving}
              maxLength={9}
              pattern="[0-9]{9}"
            />
            <input
              type="text"
              value={napStoreNumber}
              onChange={(e) => setNapStoreNumber(e.target.value)}
              placeholder="Номер на обект в НАП"
              required
              disabled={isSaving}
            />
            <p className="register-hint">
              Номерът на обекта се получава от НАП при регистрация за алтернативен режим.
            </p>

            {statusMessage && (
              <p className={`login-status ${statusMessage.includes("успешно") ? "login-status--success" : "login-status--error"}`}>
                {statusMessage}
              </p>
            )}

            <button
              type="submit"
              className="login-btn login-btn--primary"
              disabled={isSaving}
            >
              {isSaving ? "Запазване..." : "Продължи"}
            </button>
          </form>

          <p className="login-footer">
            Тези данни са необходими за издаване на електронни бележки съгласно българското законодателство.
          </p>
        </div>

        <div className="login-features">
          <div className="login-feature">
            <div className="login-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3>Законово съответствие</h3>
            <p>UDITO генерира бележки съгласно Наредба Н-18</p>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3>Одиторски файлове</h3>
            <p>Автоматично генериране на XML за НАП</p>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3>Автоматизация</h3>
            <p>Бележки се издават автоматично при плащане</p>
          </div>
        </div>
      </div>
    </main>
  );
}
