"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ReceiptSettingsState = {
  receiptNumberStart: string;
  codReceiptsEnabled: boolean;
  // Receipt appearance
  logoUrl: string;
  logoWidth: number | null;
  logoHeight: number | null;
  receiptTemplate: string;
  accentColor: string;
  // Company data for preview
  storeName: string;
  legalName: string;
  city: string;
  bulstat: string;
  vatNumber: string;
};

const templateOptions = [
  {
    value: "classic",
    name: "Класическа",
    description: "Изчистена, като от касов апарат. Центрирана, с пунктирани линии.",
  },
  {
    value: "modern",
    name: "Модерна",
    description: "Съвременен дизайн с акцентен цвят по избор.",
  },
  {
    value: "dark",
    name: "Тъмна",
    description: "Елегантен тъмен фон със светъл текст.",
  },
  {
    value: "playful",
    name: "Игрива",
    description: "Динамичен и интересен дизайн с цветни акценти.",
  },
];

const accentColors = [
  { value: "green", name: "Зелено", hex: "#10b981" },
  { value: "blue", name: "Синьо", hex: "#3b82f6" },
  { value: "orange", name: "Оранжево", hex: "#f97316" },
  { value: "pink", name: "Розово", hex: "#ec4899" },
  { value: "yellow", name: "Жълто", hex: "#eab308" },
  { value: "purple", name: "Лилаво", hex: "#a855f7" },
  { value: "white", name: "Неутрално", hex: "#6b7280" },
];

const emptyForm: ReceiptSettingsState = {
  receiptNumberStart: "",
  codReceiptsEnabled: false,
  logoUrl: "",
  logoWidth: null,
  logoHeight: null,
  receiptTemplate: "modern",
  accentColor: "green",
  storeName: "",
  legalName: "",
  city: "",
  bulstat: "",
  vatNumber: "",
};

export default function ReceiptSettingsForm() {
  const [form, setForm] = useState<ReceiptSettingsState>(emptyForm);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Load both receipt settings and company data
        const [settingsRes, companyRes] = await Promise.all([
          fetch("/api/receipts/settings"),
          fetch("/api/company"),
        ]);
        const settingsData = await settingsRes.json();
        const companyData = await companyRes.json();

        if (!cancelled) {
          setForm({
            receiptNumberStart: settingsData?.settings?.receiptNumberStart?.toString() || "",
            codReceiptsEnabled: settingsData?.settings?.codReceiptsEnabled || false,
            logoUrl: companyData?.company?.logo_url || "",
            logoWidth: companyData?.company?.logo_width || null,
            logoHeight: companyData?.company?.logo_height || null,
            receiptTemplate: companyData?.company?.receipt_template || "modern",
            accentColor: companyData?.company?.accent_color || "green",
            storeName: companyData?.company?.store_name || "",
            legalName: companyData?.company?.legal_name || "",
            city: companyData?.company?.city || "",
            bulstat: companyData?.company?.bulstat || "",
            vatNumber: companyData?.company?.vat_number || "",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("Грешка при зареждане на настройките.");
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
      // Save receipt settings
      const settingsRes = await fetch("/api/receipts/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptNumberStart: form.receiptNumberStart ? Number(form.receiptNumberStart) : null,
          codReceiptsEnabled: form.codReceiptsEnabled,
        }),
      });
      const settingsData = await settingsRes.json();
      if (!settingsData?.ok) {
        throw new Error(settingsData?.error || "Неуспешен запис на настройки.");
      }

      // Save appearance settings to company
      const companyRes = await fetch("/api/receipts/appearance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: form.logoUrl,
          logoWidth: form.logoWidth,
          logoHeight: form.logoHeight,
          receiptTemplate: form.receiptTemplate,
          accentColor: form.accentColor,
        }),
      });
      const companyData = await companyRes.json();
      if (!companyData?.ok) {
        throw new Error(companyData?.error || "Неуспешен запис на външен вид.");
      }

      setStatus("Настройките са записани.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Грешка при запис. Опитайте отново."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatus("Файлът трябва да е изображение");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setStatus("Файлът е твърде голям (макс. 2MB)");
      return;
    }

    setUploading(true);
    setStatus("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload/logo", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.error || "Грешка при качване");
        return;
      }

      if (form.logoUrl && form.logoUrl.includes("vercel-storage.com")) {
        fetch("/api/upload/logo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: form.logoUrl }),
        }).catch(console.error);
      }

      setForm((prev) => ({
        ...prev,
        logoUrl: data.url,
        logoWidth: data.width || null,
        logoHeight: data.height || null,
      }));
    } catch (error) {
      console.error("Upload error:", error);
      setStatus("Грешка при качване на логото");
    } finally {
      setUploading(false);
    }
  }

  function formatPreview(value: string): string {
    if (!value) return "0000000001";
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 1) return "0000000001";
    return String(num).padStart(10, "0");
  }

  const selectedColor = accentColors.find((c) => c.value === form.accentColor) || accentColors[0];

  return (
    <form className="form-card" onSubmit={handleSubmit}>
      <div className="form-header">
        <div>
          <h2>Настройки на електронните бележки</h2>
          <p>Настройте външния вид и номерацията на бележките.</p>
        </div>
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Запис..." : "Запази"}
        </button>
      </div>

      {status ? <p className="form-status">{status}</p> : null}

      {/* Logo Upload */}
      <section className="settings-section">
        <div className="settings-section__header">
          <h3>Лого за бележки</h3>
          <p>По подразбиране се показва името на магазина. Добавете ваше лого при нужда.</p>
        </div>
        <ul className="logo-requirements">
          <li><strong>Формат:</strong> PNG или JPG (SVG не се поддържа)</li>
          <li><strong>Размер:</strong> Препоръчителен размер 200-400px ширина</li>
          <li><strong>Макс. размер:</strong> До 2MB</li>
          <li><strong>Съвет:</strong> За най-добър резултат използвайте лого с прозрачен фон (PNG)</li>
        </ul>
        <div className="logo-upload__controls">
          <input
            id="logo-upload"
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleLogoChange}
            className="logo-upload__input"
            disabled={uploading}
          />
          <label className={`btn-secondary ${uploading ? "btn-disabled" : ""}`} htmlFor="logo-upload">
            {uploading ? "Качване..." : "Качи лого"}
          </label>
          {form.logoUrl ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setForm((prev) => ({ ...prev, logoUrl: "", logoWidth: null, logoHeight: null }))}
              disabled={uploading}
            >
              Премахни
            </button>
          ) : null}
        </div>
        {form.logoUrl ? (
          <div className="logo-upload__preview">
            <Image
              src={form.logoUrl}
              alt="Лого"
              width={96}
              height={96}
              unoptimized
            />
          </div>
        ) : null}
      </section>

      {/* Template Selection */}
      <section className="settings-section">
        <div className="settings-section__header">
          <h3>Шаблон за бележка</h3>
          <p>Изберете как да изглеждат вашите електронни бележки.</p>
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
              onClick={() => setForm((prev) => ({ ...prev, receiptTemplate: template.value }))}
            >
              <div className="template-card__title">{template.name}</div>
              <div className="template-card__desc">{template.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Accent Color (for modern and playful templates) */}
      {(form.receiptTemplate === "modern" || form.receiptTemplate === "playful") && (
        <section className="settings-section">
          <div className="settings-section__header">
            <h3>Акцентен цвят</h3>
            <p>Изберете цвят за акцентите в бележката.</p>
          </div>
          <div className="color-picker">
            {accentColors.map((color) => (
              <button
                type="button"
                key={color.value}
                className={
                  form.accentColor === color.value
                    ? "color-option active"
                    : "color-option"
                }
                style={{ "--color": color.hex } as React.CSSProperties}
                onClick={() => setForm((prev) => ({ ...prev, accentColor: color.value }))}
                title={color.name}
              >
                <span className="color-swatch" />
                <span className="color-name">{color.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Receipt Preview */}
      <section className="settings-section">
        <div className="settings-section__header">
          <h3>Преглед</h3>
          <p>Примерен изглед с вашите данни.</p>
        </div>
        <div
          className={`receipt-preview receipt-preview--${form.receiptTemplate}`}
          style={(form.receiptTemplate === "modern" || form.receiptTemplate === "playful") ? { "--accent": selectedColor.hex } as React.CSSProperties : undefined}
        >
          {form.receiptTemplate === "classic" && (
            <ClassicPreview
              logoUrl={form.logoUrl}
              storeName={form.storeName}
              legalName={form.legalName}
              city={form.city}
              bulstat={form.bulstat}
              vatNumber={form.vatNumber}
            />
          )}
          {form.receiptTemplate === "modern" && (
            <ModernPreview
              logoUrl={form.logoUrl}
              accentColor={selectedColor.hex}
              storeName={form.storeName}
              legalName={form.legalName}
            />
          )}
          {form.receiptTemplate === "dark" && (
            <DarkPreview
              logoUrl={form.logoUrl}
              storeName={form.storeName}
              legalName={form.legalName}
            />
          )}
          {form.receiptTemplate === "playful" && (
            <PlayfulPreview
              logoUrl={form.logoUrl}
              accentColor={selectedColor.hex}
              storeName={form.storeName}
              legalName={form.legalName}
            />
          )}
        </div>
      </section>

      {/* Receipt Numbering */}
      <section className="settings-section">
        <div className="settings-section__header">
          <h3>Номерация на бележки</h3>
          <p>
            Бележките се номерират автоматично с 10-цифрен номер.
            Ако вече сте издавали бележки от друга система, може да зададете
            начален номер.
          </p>
        </div>
        <div className="form-grid">
          <label>
            Начален номер на бележка
            <input
              type="number"
              min="1"
              step="1"
              value={form.receiptNumberStart}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, receiptNumberStart: event.target.value }))
              }
              placeholder="Оставете празно за номерация от 1"
            />
            <span className="input-hint">
              Следващата бележка: <strong>{formatPreview(form.receiptNumberStart)}</strong>
            </span>
          </label>
        </div>
      </section>

      {/* COD Settings */}
      <section className="settings-section">
        <div className="settings-section__header">
          <h3>Наложен платеж (COD)</h3>
          <p>
            Изберете дали да се издават електронни бележки за поръчки с наложен платеж.
          </p>
        </div>
        <div className="toggle-option">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={form.codReceiptsEnabled}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, codReceiptsEnabled: event.target.checked }))
              }
            />
            <span className="toggle-text">
              Издавай електронни бележки за поръчки с наложен платеж
            </span>
          </label>
        </div>
      </section>
    </form>
  );
}

// Preview Components
type PreviewProps = {
  logoUrl: string;
  storeName?: string;
  legalName?: string;
  city?: string;
  bulstat?: string;
  vatNumber?: string;
  accentColor?: string;
};

function getInitials(name: string): string {
  if (!name) return "??";
  return name.split(" ").map(w => w[0]).join("").slice(0, 3).toUpperCase();
}

function ClassicPreview({ logoUrl, storeName, legalName, city, bulstat, vatNumber }: PreviewProps) {
  const displayStore = storeName || "Моят магазин";
  const displayName = legalName || "Вашата фирма ЕООД";
  const displayCity = city || "София";
  const displayBulstat = bulstat || "123456789";
  const displayVat = vatNumber || "";

  return (
    <div className="preview-classic">
      <div className="preview-classic__header">
        {logoUrl ? (
          <Image src={logoUrl} alt="Logo" width={60} height={30} unoptimized style={{ objectFit: "contain", marginBottom: 6 }} />
        ) : (
          <strong className="preview-classic__store">{displayStore}</strong>
        )}
        <div className="preview-classic__company">{displayName}</div>
        <div>ул. Примерна 10, {displayCity}</div>
        <div>ЕИК: {displayBulstat}</div>
        {displayVat && <div>ДДС: {displayVat}</div>}
      </div>
      <div className="preview-classic__divider">- - - - - - - - - - - - - - - - - - - - -</div>
      <div className="preview-classic__info">
        <div><strong>№ 0000000001</strong></div>
        <div>Дата: 12.01.2026 14:30</div>
        <div>Поръчка: 10219</div>
        <div className="preview-classic__code">Код: TRX-9A8B7C6D</div>
      </div>
      <div className="preview-classic__divider">- - - - - - - - - - - - - - - - - - - - -</div>
      <div className="preview-classic__section">КЛИЕНТ</div>
      <div className="preview-classic__customer">
        <div>Иван Иванов</div>
        <div>ул. Клиентска 5, 1000 София</div>
        <div>ivan@email.bg</div>
      </div>
      <div className="preview-classic__divider">- - - - - - - - - - - - - - - - - - - - -</div>
      <div className="preview-classic__section">АРТИКУЛИ</div>
      <div className="preview-classic__items">
        <div className="preview-classic__item">
          <span>Продукт 1</span>
          <span>12,00€</span>
        </div>
        <div className="preview-classic__item-detail">1 x 10,00€ + ДДС 2,00€</div>
        <div className="preview-classic__item">
          <span>Продукт 2</span>
          <span>24,00€</span>
        </div>
        <div className="preview-classic__item-detail">2 x 10,00€ + ДДС 4,00€</div>
      </div>
      <div className="preview-classic__divider">- - - - - - - - - - - - - - - - - - - - -</div>
      <div className="preview-classic__totals">
        <div className="preview-classic__row"><span>Междинна сума</span><span>30,00€</span></div>
        <div className="preview-classic__row"><span>Доставка</span><span>5,00€</span></div>
        <div className="preview-classic__row"><span>ДДС (20%)</span><span>6,00€</span></div>
        <div className="preview-classic__total-row"><strong>ОБЩО</strong><strong>36,00€</strong></div>
      </div>
      <div className="preview-classic__divider">- - - - - - - - - - - - - - - - - - - - -</div>
      <div className="preview-classic__payment">
        <div>Платено с карта Visa •••• 4242</div>
        <div>12.01.2026</div>
      </div>
      <div className="preview-classic__qr-section">
        <div className="preview-classic__qr">▢</div>
      </div>
      <div className="preview-classic__footer">
        <div>office@example.com</div>
        <div>+359 88 123 4567</div>
      </div>
    </div>
  );
}

function ModernPreview({ logoUrl, accentColor, storeName, legalName }: PreviewProps) {
  const displayStore = storeName || "Моят магазин";
  const displayName = legalName || "Вашата фирма ЕООД";
  const initials = getInitials(storeName || legalName || "");

  return (
    <div className="preview-modern">
      <div className="preview-modern__header">
        <div className="preview-modern__logo">
          {logoUrl ? (
            <Image src={logoUrl} alt="Logo" width={50} height={50} unoptimized style={{ objectFit: "contain" }} />
          ) : (
            <strong className="preview-modern__store-name">{displayStore}</strong>
          )}
        </div>
        <div className="preview-modern__meta-block">
          <div className="preview-modern__receipt-title">Бележка <strong>0000000001</strong></div>
          <div className="preview-modern__meta">Дата: 12.01.2026 14:30</div>
          <div className="preview-modern__meta">Поръчка: 10219</div>
          <div className="preview-modern__code">Код: TRX-9A8B7C6D</div>
        </div>
      </div>

      <div className="preview-modern__grid">
        <div className="preview-modern__section">
          <div className="preview-modern__label" style={{ color: accentColor }}>ТЪРГОВЕЦ</div>
          <strong>{displayStore}</strong>
          <div className="preview-modern__text">{displayName}</div>
          <div className="preview-modern__text">ул. Примерна 10</div>
          <div className="preview-modern__text">1000 София</div>
          <div className="preview-modern__text">ЕИК: 123456789</div>
        </div>
        <div className="preview-modern__section">
          <div className="preview-modern__label" style={{ color: accentColor }}>КЛИЕНТ</div>
          <strong>Иван Иванов</strong>
          <div className="preview-modern__text">ул. Клиентска 5</div>
          <div className="preview-modern__text">1000 София</div>
          <div className="preview-modern__text">ivan@email.bg</div>
          <div className="preview-modern__text">Доставка: Еконт</div>
        </div>
      </div>

      <div className="preview-modern__label" style={{ color: accentColor }}>АРТИКУЛИ</div>
      <table className="preview-modern__table">
        <thead>
          <tr>
            <th>Артикул</th>
            <th>Кол.</th>
            <th>Цена без ДДС</th>
            <th>ДДС</th>
            <th>Общо</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Продукт 1</td>
            <td>1</td>
            <td>10,00€</td>
            <td>2,00€</td>
            <td>12,00€</td>
          </tr>
          <tr>
            <td>Продукт 2</td>
            <td>2</td>
            <td>10,00€</td>
            <td>4,00€</td>
            <td>24,00€</td>
          </tr>
        </tbody>
      </table>

      <div className="preview-modern__totals" style={{ backgroundColor: `${accentColor}15` }}>
        <div><span>Междинна сума</span><strong>30,00€</strong></div>
        <div><span>Доставка</span><strong>5,00€</strong></div>
        <div><span>ДДС (20%)</span><strong>6,00€</strong></div>
        <div className="preview-modern__total" style={{ borderTopColor: accentColor }}>
          <span>Обща сума</span><strong style={{ color: accentColor }}>36,00€</strong>
        </div>
      </div>

      <div className="preview-modern__footer">
        <div className="preview-modern__payment">
          <div className="preview-modern__label" style={{ color: accentColor }}>ПЛАЩАНЕ</div>
          <div>12.01.2026 • Платено с карта Visa •••• 4242 • 36,00€</div>
        </div>
        <div className="preview-modern__contact">
          <div className="preview-modern__label" style={{ color: accentColor }}>КОНТАКТ</div>
          <div>office@example.com</div>
          <div>+359 88 123 4567</div>
        </div>
        <div className="preview-modern__qr">▢</div>
      </div>
    </div>
  );
}

function DarkPreview({ logoUrl, storeName, legalName }: PreviewProps) {
  const displayStore = storeName || "Моят магазин";
  const displayName = legalName || "Вашата фирма ЕООД";

  return (
    <div className="preview-dark">
      <div className="preview-dark__header">
        {logoUrl ? (
          <Image src={logoUrl} alt="Logo" width={50} height={50} unoptimized style={{ objectFit: "contain" }} />
        ) : (
          <strong className="preview-dark__store">{displayStore}</strong>
        )}
        <div className="preview-dark__meta">
          <div className="preview-dark__title">Бележка <strong>0000000001</strong></div>
          <div>Дата: 12.01.2026 14:30</div>
          <div>Поръчка: 10219</div>
          <div className="preview-dark__code">Код: TRX-9A8B7C6D</div>
        </div>
      </div>

      <div className="preview-dark__grid">
        <div className="preview-dark__section">
          <div className="preview-dark__label">ТЪРГОВЕЦ</div>
          <strong>{displayStore}</strong>
          <div className="preview-dark__text">{displayName}</div>
          <div className="preview-dark__text">ул. Примерна 10, 1000 София</div>
          <div className="preview-dark__text">ЕИК: 123456789</div>
        </div>
        <div className="preview-dark__section">
          <div className="preview-dark__label">КЛИЕНТ</div>
          <strong>Иван Иванов</strong>
          <div className="preview-dark__text">ул. Клиентска 5, 1000 София</div>
          <div className="preview-dark__text">ivan@email.bg</div>
        </div>
      </div>

      <div className="preview-dark__label">АРТИКУЛИ</div>
      <div className="preview-dark__items">
        <div className="preview-dark__row">
          <span>Продукт 1</span>
          <span>12,00€</span>
        </div>
        <div className="preview-dark__row-detail">1 x 10,00€ + ДДС 2,00€</div>
        <div className="preview-dark__row">
          <span>Продукт 2</span>
          <span>24,00€</span>
        </div>
        <div className="preview-dark__row-detail">2 x 10,00€ + ДДС 4,00€</div>
      </div>

      <div className="preview-dark__totals">
        <div className="preview-dark__total-row"><span>Междинна сума</span><span>30,00€</span></div>
        <div className="preview-dark__total-row"><span>Доставка</span><span>5,00€</span></div>
        <div className="preview-dark__total-row"><span>ДДС (20%)</span><span>6,00€</span></div>
        <div className="preview-dark__total-final"><span>Обща сума</span><strong>36,00€</strong></div>
      </div>

      <div className="preview-dark__footer">
        <div className="preview-dark__contact">
          <div className="preview-dark__label">КОНТАКТ</div>
          <div>office@example.com</div>
          <div>+359 88 123 4567</div>
        </div>
        <div className="preview-dark__qr">▢</div>
      </div>
    </div>
  );
}

function PlayfulPreview({ logoUrl, accentColor, storeName, legalName }: PreviewProps) {
  const displayStore = storeName || "Моят магазин";
  const displayName = legalName || "Вашата фирма ЕООД";

  return (
    <div className="preview-playful" style={{ "--accent": accentColor } as React.CSSProperties}>
      <div className="preview-playful__header">
        {logoUrl ? (
          <Image src={logoUrl} alt="Logo" width={50} height={50} unoptimized style={{ objectFit: "contain" }} />
        ) : (
          <strong className="preview-playful__store">{displayStore}</strong>
        )}
        <div className="preview-playful__badge">БЕЛЕЖКА #0000000001</div>
        <div className="preview-playful__date">12.01.2026 14:30 • Поръчка: 10219</div>
      </div>

      <div className="preview-playful__amount">
        <div className="preview-playful__amount-label">Обща сума</div>
        <div className="preview-playful__amount-value">36,00€</div>
        <div className="preview-playful__amount-sub">Платено с карта Visa •••• 4242</div>
      </div>

      <div className="preview-playful__cards">
        <div className="preview-playful__card">
          <div className="preview-playful__card-title">ТЪРГОВЕЦ</div>
          <strong>{displayStore}</strong>
          <div>{displayName}</div>
          <div>ул. Примерна 10, 1000 София</div>
          <div>ЕИК: 123456789</div>
        </div>
        <div className="preview-playful__card">
          <div className="preview-playful__card-title">КЛИЕНТ</div>
          <strong>Иван Иванов</strong>
          <div>ул. Клиентска 5</div>
          <div>1000 София</div>
          <div>ivan@email.bg</div>
        </div>
      </div>

      <div className="preview-playful__items">
        <div className="preview-playful__items-title">АРТИКУЛИ</div>
        <div className="preview-playful__item">
          <span className="preview-playful__dot" />
          <div className="preview-playful__item-info">
            <strong>Продукт 1</strong>
            <span>1 x 10,00€ + ДДС 2,00€</span>
          </div>
          <span className="preview-playful__price">12,00€</span>
        </div>
        <div className="preview-playful__item">
          <span className="preview-playful__dot" />
          <div className="preview-playful__item-info">
            <strong>Продукт 2</strong>
            <span>2 x 10,00€ + ДДС 4,00€</span>
          </div>
          <span className="preview-playful__price">24,00€</span>
        </div>
      </div>

      <div className="preview-playful__totals">
        <div><span>Междинна сума</span><span>30,00€</span></div>
        <div><span>Доставка</span><span>5,00€</span></div>
        <div><span>ДДС (20%)</span><span>6,00€</span></div>
        <div className="preview-playful__total-final"><span>Обща сума</span><strong>36,00€</strong></div>
      </div>

      <div className="preview-playful__footer">
        <div className="preview-playful__contact">
          <div>office@example.com</div>
          <div>+359 88 123 4567</div>
          <div className="preview-playful__code">Код: TRX-9A8B7C6D</div>
        </div>
        <div className="preview-playful__qr">▢</div>
      </div>
    </div>
  );
}
