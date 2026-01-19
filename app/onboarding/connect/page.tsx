"use client";

import { useEffect, useState, Suspense, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

function ConnectForm() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [instanceId, setInstanceId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/onboarding/status");
      const data = await response.json();

      if (data.onboardingCompleted) {
        router.push("/overview");
        return;
      }

      // Check if user has a store connection
      if (data.hasStoreConnection) {
        // Has store, go to company step
        router.push("/onboarding/company");
        return;
      }

      setIsLoading(false);
    } catch (error) {
      console.error("Error checking status:", error);
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated" && session?.user) {
      checkStatus();
    }
  }, [status, session, router, checkStatus]);

  // Check if redirected back from Wix OAuth
  useEffect(() => {
    const connected = searchParams.get("connected");
    const store = searchParams.get("store");

    if (connected === "1" && store) {
      // Successfully connected, check status and redirect
      checkStatus();
    }
  }, [searchParams, checkStatus]);

  async function handleConnectWix() {
    setIsConnecting(true);
    setStatusMessage("");

    // Redirect to Wix OAuth - this will install the app and redirect back
    window.location.href = "/api/oauth/authorize";
  }

  async function handleManualConnect(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage("");

    if (!instanceId.trim()) {
      setStatusMessage("Моля въведете Instance ID");
      return;
    }

    setIsConnecting(true);

    try {
      const response = await fetch("/api/stores/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: instanceId.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Грешка при свързване");
      }

      // Success - redirect to company step
      router.push("/onboarding/company");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Възникна грешка. Опитайте отново."
      );
      setIsConnecting(false);
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
        <div className="login-card login-card--wide">
          <Link href="/" className="login-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/udito-logo.png" alt="UDITO" />
          </Link>

          {/* Progress steps */}
          <div className="onboarding-progress">
            <div className="onboarding-step onboarding-step--active">
              <span className="onboarding-step__number">1</span>
              <span className="onboarding-step__label">Магазин</span>
            </div>
            <div className="onboarding-step__line"></div>
            <div className="onboarding-step">
              <span className="onboarding-step__number">2</span>
              <span className="onboarding-step__label">Фирма</span>
            </div>
            <div className="onboarding-step__line"></div>
            <div className="onboarding-step">
              <span className="onboarding-step__number">3</span>
              <span className="onboarding-step__label">Настройки</span>
            </div>
            <div className="onboarding-step__line"></div>
            <div className="onboarding-step">
              <span className="onboarding-step__number">4</span>
              <span className="onboarding-step__label">План</span>
            </div>
          </div>

          <h1>Свържете вашия магазин</h1>
          <p className="login-subtitle">
            За да издаваме електронни бележки, трябва да свържем UDITO с вашия Wix магазин.
          </p>

          {!showManualInput ? (
            <div className="onboarding-connect-options">
              <div className="onboarding-connect-option">
                <div className="onboarding-connect-option__icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <h3>Свържи с Wix</h3>
                <p>
                  Ще бъдете пренасочени към Wix, за да инсталирате UDITO
                  или да свържете съществуваща инсталация.
                </p>
                <button
                  className="login-btn login-btn--primary"
                  onClick={handleConnectWix}
                  disabled={isConnecting}
                >
                  {isConnecting ? (
                    <>
                      <span className="login-spinner login-spinner--small"></span>
                      Свързване...
                    </>
                  ) : (
                    "Свържи с Wix"
                  )}
                </button>
              </div>

              <div className="onboarding-connect-divider">
                <span>или</span>
              </div>

              <div className="onboarding-connect-option onboarding-connect-option--secondary">
                <h3>Вече имам Instance ID</h3>
                <p>
                  Ако вече сте инсталирали UDITO и имате Instance ID,
                  можете да го въведете ръчно.
                </p>
                <button
                  className="login-btn login-btn--secondary"
                  onClick={() => setShowManualInput(true)}
                  disabled={isConnecting}
                >
                  Въведи Instance ID
                </button>
              </div>
            </div>
          ) : (
            <form className="login-email-form" onSubmit={handleManualConnect}>
              <div className="form-section">
                <p className="form-section__subtitle">
                  Въведете Instance ID от вашия Wix Dashboard.
                  Можете да го намерите в UDITO приложението в Wix.
                </p>
                <input
                  type="text"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  placeholder="Instance ID (напр. abc123-def456-...)"
                  disabled={isConnecting}
                  autoFocus
                />
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
                  onClick={() => {
                    setShowManualInput(false);
                    setInstanceId("");
                    setStatusMessage("");
                  }}
                  disabled={isConnecting}
                >
                  Назад
                </button>
                <button
                  type="submit"
                  className="login-btn login-btn--primary"
                  disabled={isConnecting}
                >
                  {isConnecting ? "Свързване..." : "Свържи"}
                </button>
              </div>
            </form>
          )}

          <div className="onboarding-help">
            <p>
              Нямате Wix магазин?{" "}
              <a href="https://www.wix.com" target="_blank" rel="noopener noreferrer">
                Създайте безплатен магазин в Wix
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function ConnectLoading() {
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

export default function OnboardingConnectPage() {
  return (
    <Suspense fallback={<ConnectLoading />}>
      <ConnectForm />
    </Suspense>
  );
}
