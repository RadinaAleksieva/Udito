import Link from "next/link";
import TokenCapture from "./overview/token-capture";

export default function Home() {
  return (
    <main className="landing">
      <TokenCapture />

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <span className="landing-logo">UDITO</span>
          <div className="landing-nav-links">
            <a href="#features">Функции</a>
            <a href="#how-it-works">Как работи</a>
            <a href="#pricing">Цени</a>
            <a href="#contact">Контакт</a>
          </div>
          <Link href="/overview" className="btn-login">
            Вход
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="landing-hero-content">
          <div className="landing-hero-badge">
            <span>Wix Stores</span>
          </div>
          <h1>Електронни бележки за Wix магазини в България</h1>
          <p className="landing-hero-subtitle">
            Автоматични касови бележки при всяка платена поръчка.
            Месечен XML файл за НАП. Без касов апарат.
          </p>
          <div className="landing-hero-cta">
            <Link href="/overview" className="btn-primary btn-large">
              Започни сега
            </Link>
            <a href="#how-it-works" className="btn-secondary btn-large">
              Научи повече
            </a>
          </div>
          <p className="landing-hero-note">
            Безплатен пробен период. Без кредитна карта.
          </p>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="landing-benefits" id="features">
        <div className="landing-container">
          <h2 className="landing-section-title">Защо UDITO?</h2>
          <p className="landing-section-subtitle">
            Всичко необходимо за фискална отчетност на онлайн магазин
          </p>
          <div className="landing-benefits-grid">
            <div className="landing-benefit-card">
              <div className="landing-benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3>Без касов апарат</h3>
              <p>
                Издавайте електронни бележки директно от системата.
                Спестете разходи за хардуер и поддръжка.
              </p>
            </div>
            <div className="landing-benefit-card">
              <div className="landing-benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3>Автоматично</h3>
              <p>
                Бележка се издава автоматично при платена поръчка.
                Сторно при отказ. Без ръчна работа.
              </p>
            </div>
            <div className="landing-benefit-card">
              <div className="landing-benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3>НАП XML</h3>
              <p>
                Месечен одиторски файл по Наредба Н-18, Приложение 38.
                Готов за изтегляне с един клик.
              </p>
            </div>
            <div className="landing-benefit-card">
              <div className="landing-benefit-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3>Сигурност</h3>
              <p>
                Данните се съхраняват криптирано.
                Достъп само за оторизирани потребители.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="landing-how-it-works" id="how-it-works">
        <div className="landing-container">
          <h2 className="landing-section-title">Как работи</h2>
          <p className="landing-section-subtitle">
            Три лесни стъпки до пълна автоматизация
          </p>
          <div className="landing-steps">
            <div className="landing-step">
              <div className="landing-step-number">1</div>
              <h3>Свържете Wix магазина</h3>
              <p>
                Инсталирайте UDITO от Wix App Market.
                Автоматично се свързва с вашия магазин.
              </p>
            </div>
            <div className="landing-step-arrow">→</div>
            <div className="landing-step">
              <div className="landing-step-number">2</div>
              <h3>Настройте фирмата</h3>
              <p>
                Въведете ЕИК, адрес и данни за бележките.
                Изберете шаблон за дизайн.
              </p>
            </div>
            <div className="landing-step-arrow">→</div>
            <div className="landing-step">
              <div className="landing-step-number">3</div>
              <h3>Готово!</h3>
              <p>
                При всяка платена поръчка се издава бележка.
                В края на месеца изтеглете XML файла.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features detail */}
      <section className="landing-features">
        <div className="landing-container">
          <div className="landing-feature-row">
            <div className="landing-feature-text">
              <h2>Електронни касови бележки</h2>
              <p>
                Всяка платена поръчка получава уникален номер на бележка.
                Клиентът вижда бележката в имейла за потвърждение.
              </p>
              <ul className="landing-feature-list">
                <li>Уникална номерация без прекъсване</li>
                <li>Автоматично сторно при отказана поръчка</li>
                <li>Поддръжка на карта и наложен платеж</li>
                <li>Пълна история на всички бележки</li>
              </ul>
            </div>
            <div className="landing-feature-visual">
              <div className="landing-receipt-preview">
                <div className="receipt-header">КАСОВА БЕЛЕЖКА</div>
                <div className="receipt-number">№ 000047</div>
                <div className="receipt-line"></div>
                <div className="receipt-item">
                  <span>Продукт 1</span>
                  <span>29.90 лв</span>
                </div>
                <div className="receipt-item">
                  <span>Доставка</span>
                  <span>5.00 лв</span>
                </div>
                <div className="receipt-line"></div>
                <div className="receipt-total">
                  <span>ОБЩО</span>
                  <span>34.90 лв</span>
                </div>
              </div>
            </div>
          </div>

          <div className="landing-feature-row landing-feature-row-reverse">
            <div className="landing-feature-text">
              <h2>Одиторски XML файл</h2>
              <p>
                Месечен файл по изискванията на Наредба Н-18, Приложение 38.
                Съдържа всички продажби и сторна за периода.
              </p>
              <ul className="landing-feature-list">
                <li>Автоматично генериране</li>
                <li>Валиден XML формат</li>
                <li>Включва продажби и възстановявания</li>
                <li>Готов за подаване към НАП</li>
              </ul>
            </div>
            <div className="landing-feature-visual">
              <div className="landing-xml-preview">
                <code>
                  {`<?xml version="1.0"?>
<audit>
  <header>
    <eik>123456789</eik>
    <period>2026-01</period>
  </header>
  <orders>
    <order id="47">...</order>
    <order id="48">...</order>
  </orders>
</audit>`}
                </code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="landing-pricing" id="pricing">
        <div className="landing-container">
          <h2 className="landing-section-title">Цени</h2>
          <p className="landing-section-subtitle">
            Прозрачно ценообразуване без скрити такси
          </p>
          <div className="landing-pricing-grid">
            <div className="landing-pricing-card">
              <div className="landing-pricing-name">Стартов</div>
              <div className="landing-pricing-price">
                <span className="landing-pricing-amount">29</span>
                <span className="landing-pricing-currency">лв/мес</span>
              </div>
              <ul className="landing-pricing-features">
                <li>До 100 поръчки/месец</li>
                <li>Електронни бележки</li>
                <li>Месечен XML файл</li>
                <li>Имейл поддръжка</li>
              </ul>
              <Link href="/overview" className="btn-secondary">
                Започни
              </Link>
            </div>
            <div className="landing-pricing-card landing-pricing-featured">
              <div className="landing-pricing-badge">Популярен</div>
              <div className="landing-pricing-name">Бизнес</div>
              <div className="landing-pricing-price">
                <span className="landing-pricing-amount">59</span>
                <span className="landing-pricing-currency">лв/мес</span>
              </div>
              <ul className="landing-pricing-features">
                <li>До 500 поръчки/месец</li>
                <li>Електронни бележки</li>
                <li>Месечен XML файл</li>
                <li>Приоритетна поддръжка</li>
                <li>Множество потребители</li>
              </ul>
              <Link href="/overview" className="btn-primary">
                Започни
              </Link>
            </div>
            <div className="landing-pricing-card">
              <div className="landing-pricing-name">Enterprise</div>
              <div className="landing-pricing-price">
                <span className="landing-pricing-amount">По договор</span>
              </div>
              <ul className="landing-pricing-features">
                <li>Неограничени поръчки</li>
                <li>Електронни бележки</li>
                <li>Месечен XML файл</li>
                <li>Персонален мениджър</li>
                <li>SLA гаранция</li>
                <li>Интеграции по поръчка</li>
              </ul>
              <a href="#contact" className="btn-secondary">
                Свържете се
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta">
        <div className="landing-container">
          <h2>Готови ли сте да автоматизирате фискалната отчетност?</h2>
          <p>Започнете безплатен пробен период още днес</p>
          <Link href="/overview" className="btn-primary btn-large">
            Започни безплатно
          </Link>
        </div>
      </section>

      {/* Contact */}
      <section className="landing-contact" id="contact">
        <div className="landing-container">
          <h2 className="landing-section-title">Контакт</h2>
          <p className="landing-section-subtitle">
            Имате въпроси? Свържете се с нас
          </p>
          <div className="landing-contact-info">
            <div className="landing-contact-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>info@udito.bg</span>
            </div>
            <div className="landing-contact-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>+359 88 888 8888</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-content">
            <div className="landing-footer-brand">
              <span className="landing-logo">UDITO</span>
              <p>Електронни бележки за Wix магазини</p>
            </div>
            <div className="landing-footer-links">
              <a href="#features">Функции</a>
              <a href="#pricing">Цени</a>
              <a href="#contact">Контакт</a>
              <Link href="/overview">Вход</Link>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <p>© 2026 UDITO от Designs by Po. Всички права запазени.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
