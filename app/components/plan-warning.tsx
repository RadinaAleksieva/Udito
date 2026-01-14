"use client";

import { useEffect, useState } from "react";

interface UsageData {
  ordersCount: number;
  planLimit: number;
  isOverLimit: boolean;
  extraOrders: number;
  extraCharge: number;
  planName: string;
}

export default function PlanWarning() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function fetchUsage() {
      try {
        const response = await fetch("/api/usage");
        if (!response.ok) {
          setIsLoading(false);
          return;
        }
        const data = await response.json();
        setUsage(data);
      } catch (error) {
        console.error("Error fetching usage:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchUsage();
  }, []);

  if (isLoading || !usage || dismissed) return null;

  // Don't show anything if usage is less than 80% of limit
  const usagePercent = usage.planLimit > 0 ? (usage.ordersCount / usage.planLimit) * 100 : 0;
  if (usagePercent < 80 && !usage.isOverLimit) return null;

  const isWarning = usagePercent >= 80 && usagePercent < 100;
  const isExceeded = usage.isOverLimit;

  return (
    <div className={`plan-warning ${isExceeded ? "plan-warning--exceeded" : "plan-warning--warning"}`}>
      <div className="plan-warning__content">
        <div className="plan-warning__icon">
          {isExceeded ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <div className="plan-warning__text">
          {isExceeded ? (
            <>
              <strong>Надвишен лимит на поръчки</strong>
              <p>
                Имате {usage.extraOrders} поръчки над лимита ({usage.planLimit}).
                Ще бъдете таксувани <strong>{usage.extraCharge.toFixed(2)} EUR</strong> в края на месеца.
              </p>
            </>
          ) : (
            <>
              <strong>Приближавате лимита</strong>
              <p>
                Използвали сте {usage.ordersCount} от {usage.planLimit} поръчки ({Math.round(usagePercent)}%).
                Над лимита се таксува по 0.10 EUR/поръчка.
              </p>
            </>
          )}
        </div>
        <button
          className="plan-warning__dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Затвори"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="plan-warning__progress">
        <div
          className="plan-warning__progress-bar"
          style={{ width: `${Math.min(usagePercent, 100)}%` }}
        />
      </div>
    </div>
  );
}
