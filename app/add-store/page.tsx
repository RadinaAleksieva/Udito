"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

function AddStoreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const storeId = searchParams.get("store") || "";
  const [storeName, setStoreName] = useState<string | null>(null);
  const [storeDomain, setStoreDomain] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [error, setError] = useState("");
  const [alreadyLinked, setAlreadyLinked] = useState(false);

  // Fetch store info
  useEffect(() => {
    if (!storeId) {
      setIsLoadingInfo(false);
      return;
    }

    async function fetchStoreInfo() {
      try {
        const response = await fetch(`/api/stores/info?siteId=${storeId}`);
        const data = await response.json();
        if (data.ok) {
          setStoreName(data.storeName || null);
          setStoreDomain(data.storeDomain || null);
          setAlreadyLinked(data.alreadyLinked || false);
        }
      } catch (err) {
        console.error("Failed to fetch store info:", err);
      } finally {
        setIsLoadingInfo(false);
      }
    }

    fetchStoreInfo();
  }, [storeId]);

  // If not authenticated, redirect to login
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push(`/login?callbackUrl=/add-store?store=${storeId}`);
    }
  }, [status, router, storeId]);

  async function handleConfirm() {
    if (!storeId || !session?.user?.id) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stores/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: storeId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Грешка при добавяне на магазина");
      }

      // Success - redirect to the new store
      router.push(`/overview?store=${storeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Възникна грешка");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCancel() {
    // Go back to overview without linking
    router.push("/overview");
  }

  if (status === "loading" || isLoadingInfo) {
    return (
      <main className="login-page">
        <div className="login-container">
          <div className="login-card">
            <div className="login-logo">
              <img src="/brand/udito-logo.png" alt="UDITO" />
            </div>
            <h1>Зареждане...</h1>
          </div>
        </div>
      </main>
    );
  }

  if (!storeId) {
    return (
      <main className="login-page">
        <div className="login-container">
          <div className="login-card">
            <Link href="/" className="login-logo">
              <img src="/brand/udito-logo.png" alt="UDITO" />
            </Link>
            <h1>Грешка</h1>
            <p className="login-subtitle">Липсва идентификатор на магазин.</p>
            <Link href="/overview" className="login-btn login-btn--primary">
              Към началната страница
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (alreadyLinked) {
    return (
      <main className="login-page">
        <div className="login-container">
          <div className="login-card">
            <Link href="/" className="login-logo">
              <img src="/brand/udito-logo.png" alt="UDITO" />
            </Link>
            <div className="add-store-icon add-store-icon--success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <h1>Магазинът вече е свързан</h1>
            <p className="login-subtitle">
              {storeName || storeDomain || "Този магазин"} вече е свързан с вашия акаунт.
            </p>
            <Link href={`/overview?store=${storeId}`} className="login-btn login-btn--primary">
              Отвори магазина
            </Link>
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

          <div className="add-store-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 21h18M3 7v1a3 3 0 006 0V7m0 0V7a3 3 0 016 0v1m0 0V7a3 3 0 016 0v1M3 7l1-4h16l1 4M5 21V10.85M19 21V10.85" />
              <path d="M9 21v-4a2 2 0 012-2h2a2 2 0 012 2v4" />
            </svg>
          </div>

          <h1>Добавяне на магазин</h1>

          <p className="login-subtitle">
            Искате ли да добавите този магазин към вашия акаунт?
          </p>

          <div className="add-store-info">
            <div className="add-store-info-row">
              <span className="add-store-info-label">Магазин:</span>
              <span className="add-store-info-value">
                {storeName || storeDomain || "Wix магазин"}
              </span>
            </div>
            {storeDomain && storeDomain !== storeName && (
              <div className="add-store-info-row">
                <span className="add-store-info-label">Домейн:</span>
                <span className="add-store-info-value">{storeDomain}</span>
              </div>
            )}
            <div className="add-store-info-row">
              <span className="add-store-info-label">Акаунт:</span>
              <span className="add-store-info-value">{session?.user?.email}</span>
            </div>
          </div>

          <div className="add-store-warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>
              Добавете магазина САМО ако сте негов собственик или имате разрешение да го управлявате.
            </span>
          </div>

          {error && (
            <p className="login-status login-status--error">{error}</p>
          )}

          <div className="add-store-actions">
            <button
              type="button"
              className="login-btn login-btn--primary"
              onClick={handleConfirm}
              disabled={isLoading}
            >
              {isLoading ? "Добавяне..." : "Да, добави магазина"}
            </button>
            <button
              type="button"
              className="login-btn login-btn--secondary"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Отказ
            </button>
          </div>

          <p className="login-footer">
            Ако това не е вашият магазин, натиснете &quot;Отказ&quot;.
          </p>
        </div>
      </div>
    </main>
  );
}

function AddStoreLoading() {
  return (
    <main className="login-page">
      <div className="login-container">
        <div className="login-card">
          <div className="login-logo">
            <img src="/brand/udito-logo.png" alt="UDITO" />
          </div>
          <h1>Зареждане...</h1>
        </div>
      </div>
    </main>
  );
}

export default function AddStorePage() {
  return (
    <Suspense fallback={<AddStoreLoading />}>
      <AddStoreContent />
    </Suspense>
  );
}
