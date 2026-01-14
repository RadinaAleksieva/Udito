"use client";

import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface PaymentFormProps {
  businessId: string;
  planId: string;
  planName: string;
  onSuccess: () => void;
  onCancel: () => void;
}

function CheckoutForm({
  businessId,
  planId,
  planName,
  onSuccess,
  onCancel,
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Submit the payment element to get the payment method
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message || "Грешка при обработка на формата");
        setIsLoading(false);
        return;
      }

      // Confirm the setup intent
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });

      if (confirmError) {
        setError(confirmError.message || "Грешка при потвърждение на картата");
        setIsLoading(false);
        return;
      }

      if (setupIntent?.status !== "succeeded") {
        setError("Картата не може да бъде верифицирана");
        setIsLoading(false);
        return;
      }

      // Verify the card with a test charge
      const verifyResponse = await fetch("/api/stripe/verify-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          paymentMethodId: setupIntent.payment_method,
          planId,
        }),
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        setError(verifyData.error || "Грешка при верификация на картата");
        setIsLoading(false);
        return;
      }

      onSuccess();
    } catch (err) {
      console.error("Payment error:", err);
      setError("Възникна грешка. Моля, опитайте отново.");
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <div className="payment-form__header">
        <h3>Добавете карта за {planName}</h3>
        <p className="payment-form__note">
          Ще направим тестова транзакция от 1 EUR, която веднага ще бъде
          възстановена. Това е само за верификация на картата.
        </p>
      </div>

      <div className="payment-form__element">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {error && <div className="payment-form__error">{error}</div>}

      <div className="payment-form__actions">
        <button
          type="button"
          className="btn-secondary"
          onClick={onCancel}
          disabled={isLoading}
        >
          Назад
        </button>
        <button type="submit" className="btn-primary" disabled={isLoading || !stripe}>
          {isLoading ? "Обработка..." : "Потвърди картата"}
        </button>
      </div>
    </form>
  );
}

interface PaymentFormWrapperProps extends Omit<PaymentFormProps, "onSuccess"> {
  onSuccess: () => void;
}

export default function PaymentFormWrapper(props: PaymentFormWrapperProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function createSetupIntent() {
      try {
        const response = await fetch("/api/stripe/setup-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId: props.businessId }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to create setup intent");
        }

        setClientSecret(data.clientSecret);
      } catch (err) {
        console.error("Setup intent error:", err);
        setError("Грешка при инициализация на плащането");
      } finally {
        setLoading(false);
      }
    }

    createSetupIntent();
  }, [props.businessId]);

  if (loading) {
    return (
      <div className="payment-form payment-form--loading">
        <p>Зареждане на формата за плащане...</p>
      </div>
    );
  }

  if (error || !clientSecret) {
    return (
      <div className="payment-form payment-form--error">
        <p>{error || "Грешка при зареждане"}</p>
        <button className="btn-secondary" onClick={props.onCancel}>
          Назад
        </button>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#0066FF",
            colorBackground: "#ffffff",
            colorText: "#1a1a1a",
            colorDanger: "#dc3545",
            fontFamily: "system-ui, sans-serif",
            borderRadius: "8px",
          },
        },
        locale: "bg",
      }}
    >
      <CheckoutForm {...props} />
    </Elements>
  );
}
