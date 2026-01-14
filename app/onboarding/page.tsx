"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cannotOnboard, setCannotOnboard] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated" && session?.user) {
      checkOnboardingStatus();
    }
  }, [status, session, router]);

  async function checkOnboardingStatus() {
    try {
      const response = await fetch("/api/onboarding/status");
      const data = await response.json();

      if (!response.ok && !data.cannotOnboard) {
        setError(data.error || "Грешка при проверка на статуса");
        return;
      }

      // User cannot onboard (not owner/admin)
      if (data.cannotOnboard) {
        setCannotOnboard(true);
        setError(data.error);
        return;
      }

      if (data.onboardingCompleted) {
        // Already completed, go to dashboard
        router.push("/overview");
        return;
      }

      // Redirect to current step
      const stepRoutes = ["/onboarding/company", "/onboarding/settings", "/onboarding/plan"];
      const currentStep = data.onboardingStep || 0;

      if (currentStep >= stepRoutes.length) {
        router.push("/overview");
      } else {
        router.push(stepRoutes[currentStep]);
      }
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      setError("Възникна грешка. Моля опитайте отново.");
    }
  }

  if (cannotOnboard) {
    return (
      <main className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/udito-logo.png" alt="UDITO" />
            </div>
            <div className="onboarding-blocked-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1>Изчакайте настройката</h1>
            <p className="login-subtitle">
              Собственикът на магазина трябва първо да завърши настройката на UDITO.
            </p>
            <p className="login-subtitle" style={{ marginTop: "16px", fontSize: "14px" }}>
              След като настройката бъде завършена, ще можете да влезете и да използвате системата.
            </p>
            <Link href="/login" className="login-btn login-btn--secondary" style={{ marginTop: "24px" }}>
              Обратно към вход
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/udito-logo.png" alt="UDITO" />
            </div>
            <h1>Грешка</h1>
            <p className="login-status login-status--error">{error}</p>
            <button
              className="login-btn login-btn--primary"
              onClick={() => window.location.reload()}
            >
              Опитай отново
            </button>
          </div>
        </div>
      </main>
    );
  }

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
