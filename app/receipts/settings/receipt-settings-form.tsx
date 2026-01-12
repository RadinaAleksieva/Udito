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
  { value: "green", name: "Зелено", hex: "#059669" },
  { value: "blue", name: "Синьо", hex: "#2563eb" },
  { value: "orange", name: "Оранжево", hex: "#ea580c" },
  { value: "pink", name: "Розово", hex: "#db2777" },
  { value: "yellow", name: "Жълто", hex: "#ca8a04" },
  { value: "purple", name: "Лилаво", hex: "#7c3aed" },
];

const emptyForm: ReceiptSettingsState = {
  receiptNumberStart: "",
  codReceiptsEnabled: false,
  logoUrl: "",
  logoWidth: null,
  logoHeight: null,
  receiptTemplate: "modern",
  accentColor: "green",
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
          <p>Примерен изглед с демо данни.</p>
        </div>
        <div
          className={`receipt-preview receipt-preview--${form.receiptTemplate}`}
          style={form.receiptTemplate === "modern" ? { "--accent": selectedColor.hex } as React.CSSProperties : undefined}
        >
          {form.receiptTemplate === "classic" && (
            <ClassicPreview logoUrl={form.logoUrl} />
          )}
          {form.receiptTemplate === "modern" && (
            <ModernPreview logoUrl={form.logoUrl} accentColor={selectedColor.hex} />
          )}
          {form.receiptTemplate === "dark" && (
            <DarkPreview logoUrl={form.logoUrl} />
          )}
          {form.receiptTemplate === "playful" && (
            <PlayfulPreview logoUrl={form.logoUrl} accentColor={selectedColor.hex} />
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
function ClassicPreview({ logoUrl }: { logoUrl: string }) {
  return (
    <div className="preview-classic">
      <div className="preview-classic__header">
        <strong>ДИЗАЙНС БАЙ ПО ЕООД</strong>
        <div>гр. София, ул. Примерна 10</div>
        <div>ЕИК: 207357583</div>
        <div>ДДС: BG207357583</div>
      </div>
      <div className="preview-classic__divider">- - - - - - - - - - - - - - -</div>
      <div className="preview-classic__info">
        <div>Чек №: 0000000001</div>
        <div>Дата: 12.01.2026 14:30</div>
        <div>Поръчка: 10219</div>
      </div>
      <div className="preview-classic__divider">- - - - - - - - - - - - - - -</div>
      <div className="preview-classic__items">
        <div className="preview-classic__item">
          <span>Тест продукт</span>
          <span>1 x 10,00€</span>
        </div>
      </div>
      <div className="preview-classic__divider">- - - - - - - - - - - - - - -</div>
      <div className="preview-classic__total">
        <strong>ОБЩО: 12,00€</strong>
        <div>Вкл. ДДС (20%): 2,00€</div>
      </div>
      <div className="preview-classic__divider">- - - - - - - - - - - - - - -</div>
      <div className="preview-classic__footer">
        <div>Платено с карта</div>
        <div className="preview-classic__qr">[ QR ]</div>
        <div>Благодарим Ви!</div>
      </div>
    </div>
  );
}

function ModernPreview({ logoUrl, accentColor }: { logoUrl: string; accentColor: string }) {
  return (
    <div className="preview-modern">
      <div className="preview-modern__header">
        <div className="preview-modern__logo">
          {logoUrl ? (
            <Image src={logoUrl} alt="Logo" width={40} height={40} unoptimized />
          ) : (
            <div className="preview-modern__logo-text">ДБП</div>
          )}
          <div>
            <strong>ДИЗАЙНС БАЙ ПО ЕООД</strong>
            <div className="preview-modern__meta">Бележка #10219 • 12.01.2026</div>
          </div>
        </div>
        <div className="preview-modern__qr">QR</div>
      </div>
      <div className="preview-modern__grid">
        <div>
          <div className="preview-modern__label">КЛИЕНТ</div>
          <div><strong>Тест Потребител</strong></div>
          <div className="preview-modern__small">гр. София</div>
        </div>
        <div>
          <div className="preview-modern__label">ПЛАЩАНЕ</div>
          <div><strong>Платено с карта</strong></div>
        </div>
      </div>
      <table className="preview-modern__table">
        <thead>
          <tr>
            <th>Артикул</th>
            <th>Кол.</th>
            <th>Цена</th>
            <th>Общо</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Тест продукт</td>
            <td>1</td>
            <td>10,00€</td>
            <td>12,00€</td>
          </tr>
        </tbody>
      </table>
      <div className="preview-modern__totals" style={{ backgroundColor: `${accentColor}15` }}>
        <div><span>Междинна сума</span><strong>10,00€</strong></div>
        <div><span>Данъци</span><strong>2,00€</strong></div>
        <div className="preview-modern__total" style={{ borderTopColor: accentColor }}>
          <span>Обща сума</span><strong style={{ color: accentColor }}>12,00€</strong>
        </div>
      </div>
    </div>
  );
}

function DarkPreview({ logoUrl }: { logoUrl: string }) {
  return (
    <div className="preview-dark">
      <div className="preview-dark__header">
        <strong>ДИЗАЙНС БАЙ ПО ЕООД</strong>
        <div>Бележка #10219 • 12.01.2026</div>
      </div>
      <div className="preview-dark__content">
        <div className="preview-dark__row">
          <span>Тест продукт × 1</span>
          <span>12,00€</span>
        </div>
        <div className="preview-dark__divider" />
        <div className="preview-dark__row preview-dark__total">
          <span>Общо</span>
          <span>12,00€</span>
        </div>
      </div>
      <div className="preview-dark__footer">
        <div>Платено с карта</div>
        <div className="preview-dark__qr">[ QR ]</div>
      </div>
    </div>
  );
}

function PlayfulPreview({ logoUrl, accentColor }: { logoUrl: string; accentColor: string }) {
  return (
    <div className="preview-playful" style={{ "--accent": accentColor } as React.CSSProperties}>
      <div className="preview-playful__header">
        <div className="preview-playful__badge">Бележка</div>
        <strong>ДИЗАЙНС БАЙ ПО ЕООД</strong>
        <div>#10219 • 12.01.2026</div>
      </div>
      <div className="preview-playful__card">
        <div className="preview-playful__item">
          <span className="preview-playful__dot" />
          <span>Тест продукт</span>
          <span className="preview-playful__price">12,00€</span>
        </div>
      </div>
      <div className="preview-playful__total">
        <div className="preview-playful__total-label">Обща сума</div>
        <div className="preview-playful__total-value">12,00€</div>
      </div>
      <div className="preview-playful__footer">
        ✓ Платено с карта
      </div>
    </div>
  );
}
