"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface OnboardingStatus {
  onboardingCompleted: boolean;
  onboardingStep: number;
  selectedPlan: string | null;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
}

export function useOnboardingGuard() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    if (authStatus === "loading") return;

    if (authStatus === "unauthenticated") {
      router.push("/login");
      return;
    }

    // Check onboarding status
    async function checkOnboarding() {
      try {
        const response = await fetch("/api/onboarding/status");
        const data = await response.json();

        if (!response.ok) {
          // No business found - might be Wix-only user, allow access
          if (data.error?.includes("бизнес")) {
            setIsAuthorized(true);
            setIsChecking(false);
            return;
          }
          console.error("Onboarding status error:", data.error);
          setIsChecking(false);
          return;
        }

        setOnboardingStatus({
          onboardingCompleted: data.onboardingCompleted,
          onboardingStep: data.onboardingStep,
          selectedPlan: data.selectedPlan,
          trialEndsAt: data.trialEndsAt,
          subscriptionStatus: data.subscriptionStatus,
        });

        if (!data.onboardingCompleted) {
          // Redirect to appropriate onboarding step
          const stepRoutes = ["/onboarding/company", "/onboarding/settings", "/onboarding/plan"];
          const currentStep = data.onboardingStep || 0;

          if (currentStep < stepRoutes.length) {
            router.push(stepRoutes[currentStep]);
          } else {
            router.push("/onboarding");
          }
          return;
        }

        // Onboarding complete
        setIsAuthorized(true);
        setIsChecking(false);
      } catch (error) {
        console.error("Error checking onboarding:", error);
        // On error, allow access (fail open for better UX)
        setIsAuthorized(true);
        setIsChecking(false);
      }
    }

    checkOnboarding();
  }, [authStatus, router, session]);

  return { isChecking, isAuthorized, onboardingStatus };
}
