"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Plan {
  id: string;
  name: string;
  ordersPerMonth: number;
  priceMonthlyEur: number;
  pricePerExtraOrderEur: number;
  isPayPerOrder: boolean;
  features: Record<string, boolean>;
}

export default function OnboardingPlanPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

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

      // If step 1 not completed, go back
      if (data.onboardingStep < 2) {
        router.push("/onboarding/settings");
        return;
      }

      // Load plans
      if (data.plans && data.plans.length > 0) {
        setPlans(data.plans);
        // Pre-select business plan as default
        setSelectedPlan(data.selectedPlan || "business");
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

    if (!selectedPlan) {
      setStatusMessage("Моля изберете план");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/onboarding/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selectedPlan }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Грешка при избор на план");
      }

      // Onboarding complete! Redirect to dashboard
      router.push("/overview");
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

  const planDescriptions: Record<string, { subtitle: string; features: string[] }> = {
    starter: {
      subtitle: "За малки магазини",
      features: ["До 50 поръчки/месец", "Електронни бележки", "Месечен XML файл", "Имейл поддръжка"],
    },
    business: {
      subtitle: "За растящи бизнеси",
      features: ["До 300 поръчки/месец", "Електронни бележки", "Месечен XML файл", "Приоритетна поддръжка", "Множество потребители"],
    },
    corporate: {
      subtitle: "За големи обеми",
      features: ["Неограничени поръчки", "Всички функции", "Приоритетна поддръжка", "0.10 EUR/поръчка"],
    },
  };

  return (
    <main className="login-page">
      <div className="login-container">
        <div className="login-card login-card--plans">
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
            <div className="onboarding-step onboarding-step--completed">
              <span className="onboarding-step__number">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="onboarding-step__label">Настройки</span>
            </div>
            <div className="onboarding-step__line onboarding-step__line--completed"></div>
            <div className="onboarding-step onboarding-step--active">
              <span className="onboarding-step__number">3</span>
              <span className="onboarding-step__label">План</span>
            </div>
          </div>

          <h1>Изберете план</h1>
          <p className="login-subtitle">
            Започнете с <strong>10 дни безплатен пробен период</strong>. Няма да ви таксуваме докато не изтече.
          </p>

          <form className="plan-selection-form" onSubmit={handleSubmit}>
            <div className="plan-cards">
              {plans.map((plan) => {
                const desc = planDescriptions[plan.id] || { subtitle: "", features: [] };
                const isPopular = plan.id === "business";

                return (
                  <div
                    key={plan.id}
                    className={`plan-card ${selectedPlan === plan.id ? "plan-card--selected" : ""} ${isPopular ? "plan-card--popular" : ""}`}
                    onClick={() => setSelectedPlan(plan.id)}
                  >
                    {isPopular && <div className="plan-card__badge">Популярен</div>}
                    <div className="plan-card__header">
                      <h3 className="plan-card__name">{plan.name}</h3>
                      <p className="plan-card__subtitle">{desc.subtitle}</p>
                    </div>
                    <div className="plan-card__price">
                      <span className="plan-card__amount">{plan.priceMonthlyEur}</span>
                      <span className="plan-card__currency">EUR/мес</span>
                      {plan.isPayPerOrder && (
                        <span className="plan-card__per-order">+ 0.10 EUR/поръчка</span>
                      )}
                    </div>
                    <ul className="plan-card__features">
                      {desc.features.map((feature, idx) => (
                        <li key={idx}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <div className="plan-card__check">
                      {selectedPlan === plan.id && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="plan-overage-note">
              При надвишаване на лимита на Starter плана, автоматично преминавате на Business план от следващия месец.
            </p>

            {statusMessage && (
              <p className="login-status login-status--error">
                {statusMessage}
              </p>
            )}

            <div className="form-buttons">
              <button
                type="button"
                className="login-btn login-btn--secondary"
                onClick={() => router.push("/onboarding/settings")}
                disabled={isSaving}
              >
                Назад
              </button>
              <button
                type="submit"
                className="login-btn login-btn--primary"
                disabled={isSaving || !selectedPlan}
              >
                {isSaving ? "Запазване..." : "Започни пробния период"}
              </button>
            </div>
          </form>

          <p className="login-footer">
            След изтичане на пробния период ще можете да продължите или да отмените абонамента.
          </p>
        </div>
      </div>
    </main>
  );
}
