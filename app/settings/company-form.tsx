"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type CompanyFormState = {
  storeName: string;
  storeDomain: string;
  legalName: string;
  vatNumber: string;
  bulstat: string;
  storeId: string;
  logoUrl: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  country: string;
  email: string;
  phone: string;
  mol: string;
  receiptTemplate: string;
};

const templateOptions = [
  {
    value: "classic",
    name: "Класически",
    description: "Изчистен и строг, с акцент върху данните.",
  },
  {
    value: "minimal",
    name: "Минимален",
    description: "Лек, въздушен и без излишни рамки.",
  },
];

const emptyForm: CompanyFormState = {
  storeName: "",
  storeDomain: "",
  legalName: "",
  vatNumber: "",
  bulstat: "",
  storeId: "",
  logoUrl: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  postalCode: "",
  country: "България",
  email: "",
  phone: "",
  mol: "",
  receiptTemplate: "classic",
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
            logoUrl: data.company.logo_url || "",
            addressLine1: data.company.address_line1 || "",
            addressLine2: data.company.address_line2 || "",
            city: data.company.city || "",
            postalCode: data.company.postal_code || "",
            country: data.company.country || "България",
            email: data.company.email || "",
            phone: data.company.phone || "",
            mol: data.company.mol || "",
            receiptTemplate: data.company.receipt_template || "classic",
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

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      updateField("logoUrl", result);
    };
    reader.readAsDataURL(file);
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

      <section className="logo-upload">
        <div>
          <h3>Лого за електронни бележки</h3>
          <p>По подразбиране бележките са без лого. Добавете ваше лого при нужда.</p>
        </div>
        <div className="logo-upload__controls">
          <input
            id="logo-upload"
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            className="logo-upload__input"
          />
          <label className="btn-secondary" htmlFor="logo-upload">
            Добави своето лого
          </label>
          {form.logoUrl ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => updateField("logoUrl", "")}
            >
              Премахни логото
            </button>
          ) : null}
        </div>
        {form.logoUrl ? (
          <div className="logo-upload__preview">
            <Image
              src={form.logoUrl}
              alt="Лого на магазина"
              width={96}
              height={96}
              unoptimized
            />
          </div>
        ) : null}
      </section>

      <section className="template-grid">
        <div className="template-header">
          <h3>Шаблон за бележка</h3>
          <p>Изберете как да изглеждат електронните бележки.</p>
        </div>
        <div className="template-cards">
          {templateOptions.map((template) => (
            <button
              type="button"
              key={template.value}
              className={
                form.receiptTemplate === template.value
                  ? "template-card active"
                  : "template-card"
              }
              onClick={() => updateField("receiptTemplate", template.value)}
            >
              <div className="template-card__title">{template.name}</div>
              <div className="template-card__desc">{template.description}</div>
            </button>
          ))}
        </div>
      </section>
      <section className="receipt-preview" data-template={form.receiptTemplate}>
        <div className="receipt-preview__header">
          <h3>Преглед на бележка</h3>
          <p>Примерен изглед с демо данни.</p>
        </div>
        <div className="receipt-preview__paper">
          <div className="receipt-preview__top">
            <div className="receipt-preview__title-wrap">
              {form.logoUrl ? (
                <Image
                  src={form.logoUrl}
                  alt="Лого на магазина"
                  className="receipt-preview__logo"
                  width={42}
                  height={42}
                  unoptimized
                />
              ) : null}
              <div>
                <strong className="receipt-preview__title">
                  {form.legalName || "Фирма"}
                </strong>
                <div className="receipt-preview__meta">
                  Бележка #10219 • 05.01.2026, 14:12
                </div>
              </div>
            </div>
            <div className="receipt-preview__qr">QR</div>
          </div>
          <div className="receipt-preview__cols">
            <div>
              <div className="receipt-preview__label">Клиент</div>
              <div>Тест потребител</div>
              <div className="receipt-preview__meta">
                Град, улица 10
              </div>
              <div className="receipt-preview__meta">08XXXXXXXX</div>
            </div>
            <div>
              <div className="receipt-preview__label">Плащане</div>
              <div>Платено с карта</div>
              <div className="receipt-preview__meta">Уникален код: pi_XXXX</div>
            </div>
          </div>
          <table className="receipt-preview__items">
            <thead>
              <tr>
                <th>Артикул</th>
                <th>Кол.</th>
                <th>Ед. цена</th>
                <th>Данък</th>
                <th>Общо</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Тест продукт</td>
                <td>1</td>
                <td>10,00 €</td>
                <td>20%</td>
                <td>12,00 €</td>
              </tr>
            </tbody>
          </table>
          <div className="receipt-preview__totals">
            <div>
              <span>Междинна сума</span>
              <strong>10,00 €</strong>
            </div>
            <div>
              <span>Данъци</span>
              <strong>2,00 €</strong>
            </div>
            <div className="receipt-preview__total">
              <span>Обща сума</span>
              <strong>12,00 €</strong>
            </div>
          </div>
        </div>
      </section>
    </form>
  );
}
