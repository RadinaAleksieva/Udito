"use client";

import { useEffect, useState } from "react";

type CompanyFormState = {
  storeName: string;
  storeDomain: string;
  legalName: string;
  vatNumber: string;
  bulstat: string;
  storeId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  email: string;
  phone: string;
  mol: string;
};

const emptyForm: CompanyFormState = {
  storeName: "",
  storeDomain: "",
  legalName: "",
  vatNumber: "",
  bulstat: "",
  storeId: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  country: "България",
  email: "",
  phone: "",
  mol: "",
};

export default function CompanyForm() {
  const [form, setForm] = useState<CompanyFormState>(emptyForm);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/company");
        const data = await response.json();
        if (!cancelled && data?.ok && data?.company) {
          setForm({
            storeName: data.company.store_name || "",
            storeDomain: data.company.store_domain || "",
            legalName: data.company.legal_name || "",
            vatNumber: data.company.vat_number || "",
            bulstat: data.company.bulstat || "",
            storeId: data.company.store_id || "",
            addressLine1: data.company.address_line1 || "",
            addressLine2: data.company.address_line2 || "",
            city: data.company.city || "",
            postalCode: data.company.postal_code || "",
            country: data.company.country || "България",
            email: data.company.email || "",
            phone: data.company.phone || "",
            mol: data.company.mol || "",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("Грешка при зареждане на данните.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");
    try {
      const response = await fetch("/api/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!data?.ok) {
        throw new Error(data?.error || "Неуспешен запис.");
      }
      setStatus("Данните са записани.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Грешка при запис. Опитайте отново."
      );
    } finally {
      setLoading(false);
    }
  }

  function updateField<K extends keyof CompanyFormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="form-header">
        <div>
          <h2>Фирмени данни</h2>
          <p>Настройте данните, които ще се отпечатват върху електронните бележки.</p>
        </div>
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Запис..." : "Запази"}
        </button>
      </div>

      {status ? <p className="form-status">{status}</p> : null}

      <div className="form-grid">
        <label>
          Име на магазина (за електронните бележки)
          <input
            value={form.storeName}
            onChange={(event) => updateField("storeName", event.target.value)}
            placeholder="Моят магазин"
          />
        </label>
        <label>
          Домейн на магазина
          <input
            value={form.storeDomain}
            onChange={(event) => updateField("storeDomain", event.target.value)}
            placeholder="example.com"
          />
        </label>
        <label>
          Фирма *
          <input
            value={form.legalName}
            onChange={(event) => updateField("legalName", event.target.value)}
            placeholder="Моля, попълнете име на фирма"
            required
          />
        </label>
        <label>
          ЕИК *
          <input
            value={form.bulstat}
            onChange={(event) => updateField("bulstat", event.target.value)}
            placeholder="XXXXXXXXX"
            required
          />
        </label>
        <label>
          Уникален код на магазина (в НАП)
          <input
            value={form.storeId}
            onChange={(event) => updateField("storeId", event.target.value)}
            placeholder="XXXXXXXXX"
            required
          />
          <span className="input-hint">
            Задължително за издаване на електронни бележки.
          </span>
        </label>
        <label>
          ДДС номер (незадължително)
          <input
            value={form.vatNumber}
            onChange={(event) => updateField("vatNumber", event.target.value)}
            placeholder="BGXXXXXXXXX"
          />
        </label>
        <label>
          Адрес
          <input
            value={form.addressLine1}
            onChange={(event) => updateField("addressLine1", event.target.value)}
            placeholder="ул. Примерна 10"
          />
        </label>
        <label>
          Адрес (допълнение)
          <input
            value={form.addressLine2}
            onChange={(event) => updateField("addressLine2", event.target.value)}
            placeholder="бл. X, вх. X"
          />
        </label>
        <label>
          Град
          <input
            value={form.city}
            onChange={(event) => updateField("city", event.target.value)}
            placeholder="град"
          />
        </label>
        <label>
          Пощенски код
          <input
            value={form.postalCode}
            onChange={(event) => updateField("postalCode", event.target.value)}
            placeholder="XXXX"
          />
        </label>
        <label>
          Държава
          <input
            value={form.country}
            onChange={(event) => updateField("country", event.target.value)}
            placeholder="България"
          />
        </label>
        <label>
          Имейл
          <input
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            placeholder="email@domain.com"
          />
        </label>
        <label>
          Телефон
          <input
            value={form.phone}
            onChange={(event) => updateField("phone", event.target.value)}
            placeholder="08XXXXXXXX"
          />
        </label>
        <label>
          МОЛ
          <input
            value={form.mol}
            onChange={(event) => updateField("mol", event.target.value)}
            placeholder="Име на управител"
          />
        </label>
      </div>

      <section className="settings-section settings-section--info">
        <div className="settings-section__header">
          <h3>Настройки на бележките</h3>
          <p>
            За настройки на външния вид на бележките (лого, шаблон, цветове), отидете на{" "}
            <a href="/receipts/settings">Настройки на електронните бележки</a>.
          </p>
        </div>
      </section>
    </form>
  );
}
