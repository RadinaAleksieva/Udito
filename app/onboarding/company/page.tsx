"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";

export default function OnboardingCompanyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  // Store company fields (for receipts)
  const [companyName, setCompanyName] = useState("");
  const [eik, setEik] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [mol, setMol] = useState("");
  const [napStoreNumber, setNapStoreNumber] = useState("");

  // Billing company (for invoicing the subscription)
  const [useSameForBilling, setUseSameForBilling] = useState(true);
  const [billingCompanyName, setBillingCompanyName] = useState("");
  const [billingEik, setBillingEik] = useState("");
  const [billingVatNumber, setBillingVatNumber] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingMol, setBillingMol] = useState("");

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

      // Pre-fill with existing data if available
      if (data.company) {
        setCompanyName(data.company.companyName || "");
        setEik(data.company.eik || "");
        setVatNumber(data.company.vatNumber || "");
        setAddress(data.company.address || "");
        setCity(data.company.city || "");
        setPostalCode(data.company.postalCode || "");
        setMol(data.company.mol || "");
        setNapStoreNumber(data.company.napStoreNumber || "");
      }

      if (data.billingCompany) {
        setUseSameForBilling(data.billingCompany.useSameAsStore ?? true);
        setBillingCompanyName(data.billingCompany.companyName || "");
        setBillingEik(data.billingCompany.eik || "");
        setBillingVatNumber(data.billingCompany.vatNumber || "");
        setBillingAddress(data.billingCompany.address || "");
        setBillingCity(data.billingCompany.city || "");
        setBillingPostalCode(data.billingCompany.postalCode || "");
        setBillingMol(data.billingCompany.mol || "");
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

    // Validate store company
    if (!companyName.trim()) {
      setStatusMessage("Моля въведете име на фирмата");
      return;
    }
    if (!eik.trim() || eik.trim().length !== 9) {
      setStatusMessage("Моля въведете валиден ЕИК (9 цифри)");
      return;
    }
    if (!address.trim()) {
      setStatusMessage("Моля въведете адрес на фирмата");
      return;
    }
    if (!napStoreNumber.trim()) {
      setStatusMessage("Моля въведете номер на обект в НАП");
      return;
    }

    // Validate billing company if different
    if (!useSameForBilling) {
      if (!billingCompanyName.trim()) {
        setStatusMessage("Моля въведете име на фирмата за фактуриране");
        return;
      }
      if (!billingEik.trim() || billingEik.trim().length !== 9) {
        setStatusMessage("Моля въведете валиден ЕИК за фирмата за фактуриране");
        return;
      }
      if (!billingAddress.trim()) {
        setStatusMessage("Моля въведете адрес на фирмата за фактуриране");
        return;
      }
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/onboarding/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Store company (for receipts)
          company: {
            companyName: companyName.trim(),
            eik: eik.trim(),
            vatNumber: vatNumber.trim() || null,
            address: address.trim(),
            city: city.trim() || null,
            postalCode: postalCode.trim() || null,
            mol: mol.trim() || null,
            napStoreNumber: napStoreNumber.trim(),
          },
          // Billing company (for subscription invoices)
          billingCompany: useSameForBilling
            ? null
            : {
                companyName: billingCompanyName.trim(),
                eik: billingEik.trim(),
                vatNumber: billingVatNumber.trim() || null,
                address: billingAddress.trim(),
                city: billingCity.trim() || null,
                postalCode: billingPostalCode.trim() || null,
                mol: billingMol.trim() || null,
              },
          useSameForBilling,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Грешка при запис на данните");
      }

      router.push("/onboarding/settings");
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
              <span className="onboarding-step__label">Фирма</span>
            </div>
            <div className="onboarding-step__line"></div>
            <div className="onboarding-step">
              <span className="onboarding-step__number">2</span>
              <span className="onboarding-step__label">Настройки</span>
            </div>
            <div className="onboarding-step__line"></div>
            <div className="onboarding-step">
              <span className="onboarding-step__number">3</span>
              <span className="onboarding-step__label">План</span>
            </div>
          </div>

          <h1>Данни на фирмата</h1>
          <p className="login-subtitle">
            Тези данни ще се използват за издаване на електронни бележки.
          </p>

          <form className="login-email-form" onSubmit={handleSubmit}>
            <div className="form-section">
              <h3 className="form-section__title">Данни за бележки</h3>

              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Име на фирмата *"
                required
                disabled={isSaving}
              />

              <div className="form-row">
                <input
                  type="text"
                  value={eik}
                  onChange={(e) => setEik(e.target.value.replace(/\D/g, ""))}
                  placeholder="ЕИК (9 цифри) *"
                  required
                  disabled={isSaving}
                  maxLength={9}
                />
                <input
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value.toUpperCase())}
                  placeholder="ИН по ДДС (незадължително)"
                  disabled={isSaving}
                />
              </div>

              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Седалище и адрес на управление *"
                required
                disabled={isSaving}
              />

              <div className="form-row">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Град"
                  disabled={isSaving}
                />
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="Пощенски код"
                  disabled={isSaving}
                />
              </div>

              <input
                type="text"
                value={mol}
                onChange={(e) => setMol(e.target.value)}
                placeholder="МОЛ (материално отговорно лице)"
                disabled={isSaving}
              />

              <input
                type="text"
                value={napStoreNumber}
                onChange={(e) => setNapStoreNumber(e.target.value)}
                placeholder="Номер на обект в НАП *"
                required
                disabled={isSaving}
              />
              <p className="register-hint">
                Номерът на обекта се получава от НАП при регистрация за алтернативен режим.
              </p>
            </div>

            <div className="form-section">
              <h3 className="form-section__title">Данни за фактуриране на абонамент</h3>
              <p className="form-section__subtitle">
                На коя фирма да издаваме фактура за месечния абонамент?
              </p>

              <div className="form-checkbox-group">
                <label className="form-checkbox">
                  <input
                    type="radio"
                    name="billingOption"
                    checked={useSameForBilling}
                    onChange={() => setUseSameForBilling(true)}
                    disabled={isSaving}
                  />
                  <span className="form-checkbox__mark"></span>
                  <span>Използвай същата фирма</span>
                </label>
                <label className="form-checkbox">
                  <input
                    type="radio"
                    name="billingOption"
                    checked={!useSameForBilling}
                    onChange={() => setUseSameForBilling(false)}
                    disabled={isSaving}
                  />
                  <span className="form-checkbox__mark"></span>
                  <span>Използвай друга фирма</span>
                </label>
              </div>

              {!useSameForBilling && (
                <div className="form-section__nested">
                  <input
                    type="text"
                    value={billingCompanyName}
                    onChange={(e) => setBillingCompanyName(e.target.value)}
                    placeholder="Име на фирмата *"
                    disabled={isSaving}
                  />

                  <div className="form-row">
                    <input
                      type="text"
                      value={billingEik}
                      onChange={(e) => setBillingEik(e.target.value.replace(/\D/g, ""))}
                      placeholder="ЕИК (9 цифри) *"
                      disabled={isSaving}
                      maxLength={9}
                    />
                    <input
                      type="text"
                      value={billingVatNumber}
                      onChange={(e) => setBillingVatNumber(e.target.value.toUpperCase())}
                      placeholder="ИН по ДДС"
                      disabled={isSaving}
                    />
                  </div>

                  <input
                    type="text"
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                    placeholder="Седалище и адрес на управление *"
                    disabled={isSaving}
                  />

                  <div className="form-row">
                    <input
                      type="text"
                      value={billingCity}
                      onChange={(e) => setBillingCity(e.target.value)}
                      placeholder="Град"
                      disabled={isSaving}
                    />
                    <input
                      type="text"
                      value={billingPostalCode}
                      onChange={(e) => setBillingPostalCode(e.target.value)}
                      placeholder="Пощенски код"
                      disabled={isSaving}
                    />
                  </div>

                  <input
                    type="text"
                    value={billingMol}
                    onChange={(e) => setBillingMol(e.target.value)}
                    placeholder="МОЛ"
                    disabled={isSaving}
                  />
                </div>
              )}
            </div>

            {statusMessage && (
              <p className="login-status login-status--error">
                {statusMessage}
              </p>
            )}

            <button
              type="submit"
              className="login-btn login-btn--primary"
              disabled={isSaving}
            >
              {isSaving ? "Запазване..." : "Продължи"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
