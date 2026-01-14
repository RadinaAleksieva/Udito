"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SubscriptionStatus = {
  hasSubscription: boolean;
  status: "trial" | "active" | "expired" | "cancelled" | "none";
  isActive: boolean;
  daysRemaining: number;
  trialEndsAt: string | null;
};

export default function SubscriptionBanner() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch("/api/subscription/status");
        const data = await response.json();
        setSubscription(data);
      } catch (error) {
        console.error("Error fetching subscription status:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchStatus();
  }, []);

  if (isLoading || !subscription) {
    return null;
  }

  // Don't show banner for active paid subscriptions
  if (subscription.status === "active" && subscription.daysRemaining > 30) {
    return null;
  }

  const bannerClass =
    subscription.status === "expired" || !subscription.isActive
      ? "subscription-banner subscription-banner--expired"
      : subscription.daysRemaining <= 3
        ? "subscription-banner subscription-banner--warning"
        : "subscription-banner subscription-banner--trial";

  return (
    <div className={bannerClass}>
      <div className="subscription-banner__content">
        {subscription.status === "trial" && subscription.isActive ? (
          <>
            <span className="subscription-banner__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </span>
            <span className="subscription-banner__text">
              <strong>Пробен период:</strong> Остават {subscription.daysRemaining} дни
            </span>
          </>
        ) : subscription.status === "expired" || !subscription.isActive ? (
          <>
            <span className="subscription-banner__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <span className="subscription-banner__text">
              <strong>Пробният период изтече.</strong> Абонирайте се, за да продължите да използвате UDITO.
            </span>
            <Link href="/billing" className="subscription-banner__button">
              Абонирай се
            </Link>
          </>
        ) : (
          <>
            <span className="subscription-banner__icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </span>
            <span className="subscription-banner__text">
              Абонаментът ви изтича след {subscription.daysRemaining} дни
            </span>
            <Link href="/billing" className="subscription-banner__button">
              Виж план
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
