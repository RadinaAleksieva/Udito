"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TopNavClient from "../components/top-nav-client";

type SubscriptionStatus = {
  hasSubscription: boolean;
  status: string;
  isActive: boolean;
  daysRemaining: number;
  trialEndsAt: string | null;
  businessName: string;
};

const plans = [
  {
    id: "starter",
    name: "Стартов",
    price: 5,
    currency: "EUR",
    period: "месец",
    features: [
      "До 50 поръчки/месец",
      "Електронни бележки",
      "Одиторски XML файлове",
      "Имейл поддръжка",
    ],
  },
  {
    id: "business",
    name: "Бизнес",
    price: 15,
    currency: "EUR",
    period: "месец",
    popular: true,
    features: [
      "До 300 поръчки/месец",
      "Електронни бележки",
      "Одиторски XML файлове",
      "Приоритетна поддръжка",
    ],
  },
  {
    id: "scale",
    name: "Мащабен",
    price: 15,
    currency: "EUR",
    period: "месец",
    extraText: "+ 0.10€ за всяка поръчка над 300",
    features: [
      "Неограничен брой поръчки",
      "Електронни бележки",
      "Одиторски XML файлове",
      "Приоритетна поддръжка",
      "Гъвкаво таксуване",
    ],
  },
];

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

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

    if (status === "authenticated") {
      fetchStatus();
    }
  }, [status, router]);

  if (status === "loading" || isLoading) {
    return (
      <main>
        <TopNavClient title="Абонамент" />
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
      <TopNavClient title="Абонамент" />
      <div className="container">
        <section className="billing-header">
          <h1>Изберете план</h1>
          {subscription?.status === "trial" && subscription.isActive ? (
            <p className="billing-trial-info">
              Пробният ви период изтича след <strong>{subscription.daysRemaining} дни</strong>.
              Изберете план, за да продължите да използвате UDITO.
            </p>
          ) : subscription?.status === "expired" || !subscription?.isActive ? (
            <p className="billing-expired-info">
              Пробният ви период изтече. Абонирайте се, за да продължите да използвате UDITO.
            </p>
          ) : (
            <p>Изберете план, който най-добре отговаря на вашите нужди.</p>
          )}
        </section>

        <section className="billing-plans">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`billing-plan ${plan.popular ? "billing-plan--popular" : ""}`}
            >
              {plan.popular && <span className="billing-plan__badge">Най-популярен</span>}
              <h2 className="billing-plan__name">{plan.name}</h2>
              <div className="billing-plan__price">
                <span className="billing-plan__amount">{plan.price}</span>
                <span className="billing-plan__currency">€</span>
                <span className="billing-plan__period">/ {plan.period}</span>
              </div>
              {"extraText" in plan && plan.extraText && (
                <p className="billing-plan__extra">{plan.extraText}</p>
              )}
              <ul className="billing-plan__features">
                {plan.features.map((feature, idx) => (
                  <li key={idx}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>
              <button
                className={`billing-plan__button ${plan.popular ? "billing-plan__button--primary" : ""}`}
                onClick={() => {
                  // TODO: Implement Stripe checkout
                  alert(`Плащането ще бъде имплементирано скоро. Избран план: ${plan.name}`);
                }}
              >
                Избери {plan.name}
              </button>
            </div>
          ))}
        </section>

        <section className="billing-faq">
          <h2>Често задавани въпроси</h2>
          <div className="billing-faq__items">
            <details className="billing-faq__item">
              <summary>Мога ли да сменя плана си по-късно?</summary>
              <p>
                Да, можете да надградите или понижите плана си по всяко време.
                Промените влизат в сила незабавно.
              </p>
            </details>
            <details className="billing-faq__item">
              <summary>Какви методи на плащане приемате?</summary>
              <p>
                Приемаме всички основни кредитни и дебитни карти (Visa, Mastercard, American Express),
                както и плащания чрез банков превод.
              </p>
            </details>
            <details className="billing-faq__item">
              <summary>Има ли ангажимент за минимален период?</summary>
              <p>
                Не, можете да отмените абонамента си по всяко време.
                Няма скрити такси или неустойки за отказ.
              </p>
            </details>
            <details className="billing-faq__item">
              <summary>Какво става с данните ми ако отменя?</summary>
              <p>
                Вашите данни се запазват за 30 дни след отмяна.
                Можете да изтеглите одиторските файлове и бележки преди изтичане на този период.
              </p>
            </details>
          </div>
        </section>

        <div className="billing-back">
          <Link href="/overview">← Назад към таблото</Link>
        </div>
      </div>
      <footer className="footer">UDITO от ДИЗАЙНС БАЙ ПО ЕООД</footer>
    </main>
  );
}
