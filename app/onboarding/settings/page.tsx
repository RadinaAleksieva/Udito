"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function OnboardingSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Settings
  const [receiptsStartDate, setReceiptsStartDate] = useState("");
  const [codReceiptsEnabled, setCodReceiptsEnabled] = useState(true);
  const [initialReceiptNumber, setInitialReceiptNumber] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated" && session?.user) {
      checkStatus();
    }
  }, [status, session, router]);

  async function checkStatus() {
    try {
      const response = await fetch("/api/onboarding/status");
      const data = await response.json();

      if (data.onboardingCompleted) {
        router.push("/overview");
        return;
      }

      // If step 0 not completed, go back
      if (data.onboardingStep < 1) {
        router.push("/onboarding/company");
        return;
      }

      // Pre-fill with existing data if available
      if (data.settings) {
        setReceiptsStartDate(data.settings.receiptsStartDate || "");
        setCodReceiptsEnabled(data.settings.codReceiptsEnabled ?? true);
        setInitialReceiptNumber(data.settings.initialReceiptNumber || "");
      } else {
        // Default: start from today
        const today = new Date().toISOString().split("T")[0];
        setReceiptsStartDate(today);
      }

      setIsLoading(false);
    } catch (error) {
      console.error("Error checking status:", error);
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage("");

    if (!receiptsStartDate) {
      setStatusMessage("Моля изберете дата за начало на издаване на бележки");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/onboarding/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptsStartDate,
          codReceiptsEnabled,
          initialReceiptNumber: initialReceiptNumber.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Грешка при запис на данните");
      }

      router.push("/onboarding/plan");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Възникна грешка. Опитайте отново."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (status === "loading" || isLoading) {
    return (
      <main className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/udito-logo.png" alt="UDITO" />
          </Link>

          {/* Progress steps */}
          <div className="onboarding-progress">
            <div className="onboarding-step onboarding-step--completed">
              <span className="onboarding-step__number">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="onboarding-step__label">Фирма</span>
            </div>
            <div className="onboarding-step__line onboarding-step__line--completed"></div>
            <div className="onboarding-step onboarding-step--active">
              <span className="onboarding-step__number">2</span>
              <span className="onboarding-step__label">Настройки</span>
            </div>
            <div className="onboarding-step__line"></div>
            <div className="onboarding-step">
              <span className="onboarding-step__number">3</span>
              <span className="onboarding-step__label">План</span>
            </div>
          </div>

          <h1>Настройки на бележките</h1>
          <p className="login-subtitle">
            Конфигурирайте как да се издават електронните бележки.
          </p>

          <form className="login-email-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Начална дата за издаване на бележки</label>
              <input
                type="date"
                value={receiptsStartDate}
                onChange={(e) => setReceiptsStartDate(e.target.value)}
                required
                disabled={isSaving}
                className="form-input--date"
              />
              <p className="register-hint">
                Бележки ще се издават само за поръчки платени след тази дата.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Издаване на бележки при наложен платеж (COD)</label>
              <div className="form-checkbox-group">
                <label className="form-checkbox">
                  <input
                    type="radio"
                    name="codOption"
                    checked={codReceiptsEnabled}
                    onChange={() => setCodReceiptsEnabled(true)}
                    disabled={isSaving}
                  />
                  <span className="form-checkbox__mark"></span>
                  <span>Да, издавай бележки при COD поръчки</span>
                </label>
                <label className="form-checkbox">
                  <input
                    type="radio"
                    name="codOption"
                    checked={!codReceiptsEnabled}
                    onChange={() => setCodReceiptsEnabled(false)}
                    disabled={isSaving}
                  />
                  <span className="form-checkbox__mark"></span>
                  <span>Не, не издавай бележки при COD</span>
                </label>
              </div>
              <p className="register-hint">
                При наложен платеж, куриерската фирма обикновено издава касова бележка.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Начален номер на бележка (незадължително)</label>
              <input
                type="text"
                value={initialReceiptNumber}
                onChange={(e) => setInitialReceiptNumber(e.target.value.replace(/\D/g, ""))}
                placeholder="Например: 1000"
                disabled={isSaving}
              />
              <p className="register-hint">
                Ако имате съществуващи бележки, въведете следващия номер. Иначе започваме от 1.
              </p>
            </div>

            {statusMessage && (
              <p className="login-status login-status--error">
                {statusMessage}
              </p>
            )}

            <div className="form-buttons">
              <button
                type="button"
                className="login-btn login-btn--secondary"
                onClick={() => router.push("/onboarding/company")}
                disabled={isSaving}
              >
                Назад
              </button>
              <button
                type="submit"
                className="login-btn login-btn--primary"
                disabled={isSaving}
              >
                {isSaving ? "Запазване..." : "Продължи"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
