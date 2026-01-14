"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import WinkingFace from "@/app/components/winking-face";

// Broadcast channel for cross-window communication
const LOGIN_CHANNEL = "udito-login-channel";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/overview";
  const error = searchParams.get("error");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [showAccessCode, setShowAccessCode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [instanceId, setInstanceId] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [isInIframe, setIsInIframe] = useState(false);
  const [wixParams, setWixParams] = useState<{
    instance?: string;
    instanceId?: string;
    siteId?: string;
  }>({});

  // Notify other tabs/windows about login (for Wix iframe refresh)
  const broadcastLoginSuccess = useCallback(() => {
    try {
      const channel = new BroadcastChannel(LOGIN_CHANNEL);
      channel.postMessage({ type: "LOGIN_SUCCESS", timestamp: Date.now() });
      channel.close();
      console.log("📢 Broadcasted login success to other tabs");
    } catch (err) {
      console.log("BroadcastChannel not supported, trying localStorage fallback");
      // Fallback for browsers without BroadcastChannel
      localStorage.setItem("udito-login-event", Date.now().toString());
    }
  }, []);

  useEffect(() => {
    // Detect if we're in an iframe (embedded in Wix)
    let inIframe = false;
    try {
      inIframe = window.self !== window.top;
      setIsInIframe(inIframe);
    } catch {
      inIframe = true;
      setIsInIframe(true);
    }

    // If in iframe, listen for login broadcasts from popup windows
    if (inIframe) {
      const handleLoginBroadcast = (event: MessageEvent) => {
        if (event.data?.type === "LOGIN_SUCCESS") {
          console.log("🔄 Received login broadcast, refreshing iframe...");
          window.location.reload();
        }
      };

      try {
        const channel = new BroadcastChannel(LOGIN_CHANNEL);
        channel.addEventListener("message", handleLoginBroadcast);

        // Also listen for localStorage changes (fallback)
        const handleStorage = (e: StorageEvent) => {
          if (e.key === "udito-login-event") {
            console.log("🔄 Received login event via localStorage, refreshing...");
            window.location.reload();
          }
        };
        window.addEventListener("storage", handleStorage);

        return () => {
          channel.close();
          window.removeEventListener("storage", handleStorage);
        };
      } catch {
        // BroadcastChannel not supported, use localStorage only
        const handleStorage = (e: StorageEvent) => {
          if (e.key === "udito-login-event") {
            console.log("🔄 Received login event via localStorage, refreshing...");
            window.location.reload();
          }
        };
        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
      }
    }

    // Capture Wix params from URL
    const params = new URLSearchParams(window.location.search);
    const instance = params.get("instance") || undefined;
    const wixInstanceId = params.get("instanceId") || params.get("instance_id") || undefined;
    const siteId = params.get("siteId") || params.get("site_id") || undefined;

    // Debug logging
    console.log("🔍 UDITO Login Debug:", {
      fullUrl: window.location.href,
      search: window.location.search,
      instance: instance ? `${instance.substring(0, 20)}...` : "NOT FOUND",
      instanceId: wixInstanceId || "NOT FOUND",
      siteId: siteId || "NOT FOUND",
      isInIframe: inIframe,
    });

    setWixParams({ instance, instanceId: wixInstanceId, siteId });

    // Pre-fill instance ID if available
    if (wixInstanceId) {
      setInstanceId(wixInstanceId);
    }

    // AUTO-LOGIN: If we have Wix instance token, try to authenticate automatically
    if (instance || wixInstanceId) {
      console.log("🚀 Attempting auto-login with Wix params...");
      autoLoginWithWix(instance, wixInstanceId, siteId);
    } else {
      console.log("⚠️ No Wix params found - showing manual login");
    }
  }, []);

  async function autoLoginWithWix(instance?: string, wixInstanceId?: string, siteId?: string) {
    setStatus("Автоматично свързване с Wix...");
    setIsLoading("auto");
    try {
      const response = await fetch("/api/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: wixInstanceId,
          token: instance,
          siteId: siteId,
        }),
      });
      const data = await response.json();
      console.log("📡 Instance API response:", data);

      // Even if API returns ok:false, we still have the instance - redirect anyway
      // The instance will be passed via URL for iframe contexts where cookies don't work
      const effectiveInstanceId = data?.instanceId || wixInstanceId;
      const effectiveSiteId = data?.siteId || siteId;

      if (effectiveInstanceId) {
        setStatus("Пренасочване...");
        // Pass instance via URL for iframe context (cookies might be blocked)
        const redirectUrl = new URL(callbackUrl, window.location.origin);
        redirectUrl.searchParams.set("instanceId", effectiveInstanceId);
        if (effectiveSiteId) {
          redirectUrl.searchParams.set("siteId", effectiveSiteId);
        }
        if (instance) {
          redirectUrl.searchParams.set("instance", instance);
        }
        console.log("🔄 Redirecting to:", redirectUrl.toString());
        window.location.href = redirectUrl.toString();
      } else {
        // No instance ID at all - show manual login
        console.log("❌ No instance ID available");
        setStatus("");
        setIsLoading(null);
      }
    } catch (err) {
      console.error("❌ Auto-login error:", err);
      // Auto-login failed, show manual login options
      setStatus("");
      setIsLoading(null);
    }
  }

  async function handleEmailLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setIsLoading("email");
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) {
        setStatus("Грешен имейл или парола");
      } else {
        // Capture Wix instance if available
        if (wixParams.instanceId || wixParams.instance) {
          try {
            await fetch("/api/instance", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                instanceId: wixParams.instanceId,
                token: wixParams.instance,
                siteId: wixParams.siteId,
              }),
            });
          } catch {
            // Continue even if instance capture fails
          }
        }
        // Build redirect URL with Wix params
        const redirectUrl = new URL(callbackUrl, window.location.origin);
        if (wixParams.instanceId) redirectUrl.searchParams.set("instanceId", wixParams.instanceId);
        if (wixParams.instance) redirectUrl.searchParams.set("instance", wixParams.instance);
        if (wixParams.siteId) redirectUrl.searchParams.set("siteId", wixParams.siteId);
        // Broadcast login success to iframe before redirect
        broadcastLoginSuccess();
        window.location.href = redirectUrl.toString();
      }
    } catch {
      setStatus("Възникна грешка. Опитайте отново.");
    } finally {
      setIsLoading(null);
    }
  }

  async function handleAccessCodeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("");
    setIsLoading("code");
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
      // Broadcast login success to iframe before redirect
      broadcastLoginSuccess();
      window.location.href = callbackUrl;
    } catch (err) {
      setStatus(
        err instanceof Error
          ? err.message
          : "Неуспешно свързване. Проверете данните."
      );
    } finally {
      setIsLoading(null);
    }
  }

  return (
    <main className="login-page">
      <div className="login-container">
        <div className="login-card">
          <Link href="/" className="login-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/udito-logo.png" alt="UDITO" />
          </Link>

          <h1>Влезте в UDITO</h1>
          <p className="login-subtitle">
            Управлявайте електронните си бележки и одиторски файлове
          </p>

          {error && (
            <div className="login-error">
              {error === "OAuthSignin" && "Грешка при свързване с Google."}
              {error === "OAuthCallback" && "Грешка при автентикация."}
              {error === "OAuthAccountNotLinked" && "Този акаунт вече е свързан с друг потребител."}
              {error === "Callback" && "Грешка при обратно извикване."}
              {error === "CredentialsSignin" && "Грешен имейл или парола."}
              {!["OAuthSignin", "OAuthCallback", "OAuthAccountNotLinked", "Callback", "CredentialsSignin"].includes(error) && "Възникна грешка. Опитайте отново."}
            </div>
          )}

          {isLoading === "auto" && (
            <div className="login-auto-connect">
              <div className="login-spinner"></div>
              <p>{status || "Свързване с Wix..."}</p>
            </div>
          )}

          {isLoading !== "auto" && !showEmailForm && !showAccessCode && (
            <>
              {isInIframe && (
                <div className="login-iframe-notice">
                  <p>За пълна функционалност, отворете UDITO в нов прозорец:</p>
                  <a
                    href={(() => {
                      const url = new URL("/login", window.location.origin);
                      url.searchParams.set("callbackUrl", callbackUrl);
                      if (wixParams.instance) url.searchParams.set("instance", wixParams.instance);
                      if (wixParams.instanceId) url.searchParams.set("instanceId", wixParams.instanceId);
                      if (wixParams.siteId) url.searchParams.set("siteId", wixParams.siteId);
                      return url.toString();
                    })()}
                    target="_blank"
                    rel="noreferrer"
                    className="login-btn login-btn--primary"
                  >
                    Отвори в нов прозорец
                  </a>
                  <div className="login-divider">
                    <span>или използвайте код за достъп</span>
                  </div>
                </div>
              )}

              {!isInIframe && (
                <div className="login-buttons">
                  <button
                    className="login-btn login-btn--google"
                    onClick={() => {
                      setIsLoading("google");
                      // Build callback URL with Wix params
                      const redirectUrl = new URL(callbackUrl, window.location.origin);
                      if (wixParams.instanceId) redirectUrl.searchParams.set("instanceId", wixParams.instanceId);
                      if (wixParams.instance) redirectUrl.searchParams.set("instance", wixParams.instance);
                      if (wixParams.siteId) redirectUrl.searchParams.set("siteId", wixParams.siteId);
                      // Flag to broadcast login success after OAuth redirect
                      redirectUrl.searchParams.set("loginBroadcast", "1");
                      signIn("google", { callbackUrl: redirectUrl.toString() });
                    }}
                    disabled={isLoading !== null}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    <span>{isLoading === "google" ? "Свързване..." : "Продължи с Google"}</span>
                  </button>

                  <button
                    className="login-btn login-btn--email"
                    onClick={() => setShowEmailForm(true)}
                    disabled={isLoading !== null}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span>Продължи с имейл</span>
                  </button>
                </div>
              )}

              <div className="login-divider">
                <span>или</span>
              </div>

              <button
                className="login-access-toggle login-accountant-btn"
                onClick={() => setShowAccessCode(true)}
              >
                <span className="login-accountant-icon">
                  <WinkingFace size={28} />
                </span>
                <span>Вход за счетоводители</span>
              </button>
            </>
          )}

          {showEmailForm && (
            <form className="login-email-form" onSubmit={handleEmailLogin}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Имейл адрес"
                required
                disabled={isLoading !== null}
                autoComplete="email"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Парола"
                required
                disabled={isLoading !== null}
                autoComplete="current-password"
              />
              {status && <p className="login-status login-status--error">{status}</p>}
              <button
                type="submit"
                className="login-btn login-btn--primary"
                disabled={isLoading !== null}
              >
                {isLoading === "email" ? "Влизане..." : "Влез"}
              </button>
              <p className="login-register-link">
                Нямате акаунт? <Link href="/register">Регистрирайте се</Link>
              </p>
              <button
                type="button"
                className="login-access-back"
                onClick={() => {
                  setShowEmailForm(false);
                  setStatus("");
                }}
              >
                Назад
              </button>
            </form>
          )}

          {showAccessCode && (
            <form className="login-access-form" onSubmit={handleAccessCodeSubmit}>
              <div className="login-accountant-header">
                <span className="login-accountant-icon login-accountant-icon--large">
                  <WinkingFace size={56} />
                </span>
                <h3>Вход за счетоводители</h3>
              </div>
              <p className="login-access-hint">
                Въведете кода за достъп, получен от вашия клиент
              </p>
              <input
                type="text"
                value={instanceId}
                onChange={(e) => setInstanceId(e.target.value)}
                placeholder="Код за достъп"
                required
                disabled={isLoading !== null}
              />
              {status && <p className="login-status">{status}</p>}
              <button
                type="submit"
                className="login-btn login-btn--code"
                disabled={isLoading !== null}
              >
                {isLoading === "code" ? "Проверка..." : "Влез"}
              </button>
              <button
                type="button"
                className="login-access-back"
                onClick={() => {
                  setShowAccessCode(false);
                  setStatus("");
                }}
              >
                Назад
              </button>
            </form>
          )}

          <p className="login-footer">
            С влизането приемате нашите{" "}
            <Link href="/policies/terms">Условия за ползване</Link> и{" "}
            <Link href="/policies/privacy">Политика за поверителност</Link>
          </p>
        </div>

        <div className="login-features">
          <div className="login-feature">
            <div className="login-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3>Сигурност</h3>
            <p>Данните ви са защитени с индустриални стандарти</p>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3>Бърз достъп</h3>
            <p>Влезте с един клик чрез Google или имейл</p>
          </div>
          <div className="login-feature">
            <div className="login-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3>Много магазини</h3>
            <p>Управлявайте всичките си Wix магазини от един акаунт</p>
          </div>
        </div>
      </div>
    </main>
  );
}

function LoginLoading() {
  return (
    <main className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/udito-logo.png" alt="UDITO" />
          </div>
          <h1>Влезте в UDITO</h1>
          <p className="login-subtitle">Зареждане...</p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm />
    </Suspense>
  );
}
