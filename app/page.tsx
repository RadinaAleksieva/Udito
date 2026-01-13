"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import TokenCapture from "./overview/token-capture";

export default function Home() {
  const [scrollY, setScrollY] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setIsLoaded(true);

    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const parallaxOffset = Math.min(scrollY * 0.3, 150);
  const heroOpacity = Math.max(1 - scrollY / 600, 0);

  return (
    <main className="apple-landing">
      <TokenCapture />

      {/* Navigation - Glass effect */}
      <nav className={`apple-nav ${scrollY > 50 ? "apple-nav--scrolled" : ""}`}>
        <div className="apple-nav__inner">
          <Link href="/" className="apple-nav__logo">
            <Image
              src="/brand/udito-logo.png"
              alt="UDITO"
              width={100}
              height={33}
              priority
            />
          </Link>
          <div className="apple-nav__links">
            <a href="#features">Функции</a>
            <a href="#how">Как работи</a>
            <a href="#pricing">Цени</a>
          </div>
          <Link href="/overview" className="apple-nav__cta">
            Вход
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        className={`apple-hero ${isLoaded ? "apple-hero--loaded" : ""}`}
        ref={heroRef}
        style={{ opacity: heroOpacity }}
      >
        <div className="apple-hero__bg">
          <div className="apple-hero__gradient"></div>
          <div className="apple-hero__orb apple-hero__orb--1"></div>
          <div className="apple-hero__orb apple-hero__orb--2"></div>
          <div className="apple-hero__orb apple-hero__orb--3"></div>
        </div>

        <div className="apple-hero__content">
          <div className="apple-hero__eyebrow">За Wix магазини в България</div>
          <h1 className="apple-hero__title">
            Електронни бележки.
            <br />
            <span>Автоматично.</span>
          </h1>
          <p className="apple-hero__subtitle">
            Фискална отчетност без касов апарат. Интеграция с Wix за минути.
          </p>
          <div className="apple-hero__cta">
            <Link href="/overview" className="apple-btn apple-btn--primary">
              Започни безплатно
            </Link>
            <a href="#how" className="apple-btn apple-btn--secondary">
              Научи повече
            </a>
          </div>
        </div>

        {/* Floating Glass Card */}
        <div
          className="apple-hero__card"
          style={{ transform: `translateY(${parallaxOffset}px)` }}
        >
          <div className="glass-card">
            <div className="glass-card__header">
              <div className="glass-card__dot glass-card__dot--green"></div>
              <span>Бележка издадена</span>
            </div>
            <div className="glass-card__body">
              <div className="glass-card__receipt">
                <div className="glass-card__receipt-num">№ 000052</div>
                <div className="glass-card__receipt-row">
                  <span>Поръчка</span>
                  <span>#10248</span>
                </div>
                <div className="glass-card__receipt-row">
                  <span>Сума</span>
                  <span>89.90 €</span>
                </div>
                <div className="glass-card__receipt-divider"></div>
                <div className="glass-card__receipt-row glass-card__receipt-row--total">
                  <span>Общо</span>
                  <span>89.90 €</span>
                </div>
              </div>
            </div>
            <div className="glass-card__footer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 13l4 4L19 7" />
              </svg>
              <span>Изпратена на клиента</span>
            </div>
          </div>

          {/* Mini floating elements */}
          <div className="floating-pill floating-pill--1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Синхронизирано
          </div>
          <div className="floating-pill floating-pill--2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            XML готов
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="apple-stats">
        <div className="apple-stats__inner">
          <div className="apple-stat">
            <span className="apple-stat__value">5€</span>
            <span className="apple-stat__label">на месец</span>
          </div>
          <div className="apple-stat__divider"></div>
          <div className="apple-stat">
            <span className="apple-stat__value">0</span>
            <span className="apple-stat__label">ръчна работа</span>
          </div>
          <div className="apple-stat__divider"></div>
          <div className="apple-stat">
            <span className="apple-stat__value">100%</span>
            <span className="apple-stat__label">автоматизация</span>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="apple-features" id="features">
        <div className="apple-section__header">
          <h2 className="apple-section__title">
            Всичко, от което
            <br />
            се нуждаете.
          </h2>
          <p className="apple-section__subtitle">
            Пълна автоматизация. Нула усилия.
          </p>
        </div>

        <div className="apple-features__grid">
          {[
            {
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: "Автоматични бележки",
              desc: "При всяка платена поръчка системата издава бележка без намеса от вас.",
            },
            {
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              ),
              title: "Сторно при отказ",
              desc: "Отказана поръчка? Сторно бележката се генерира автоматично.",
            },
            {
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              title: "XML за НАП",
              desc: "Месечен одиторски файл по Наредба Н-18 готов с един клик.",
            },
          ].map((feature, idx) => (
            <div
              key={idx}
              className={`apple-feature-card ${activeFeature === idx ? "apple-feature-card--active" : ""}`}
              onMouseEnter={() => setActiveFeature(idx)}
            >
              <div className="apple-feature-card__icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="apple-how" id="how">
        <div className="apple-section__header">
          <h2 className="apple-section__title">
            Три стъпки.
            <br />
            Пет минути.
          </h2>
        </div>

        <div className="apple-how__steps">
          <div className="apple-step">
            <div className="apple-step__num">1</div>
            <div className="apple-step__content">
              <h3>Свържете Wix магазина</h3>
              <p>Инсталирайте UDITO от Wix App Market. Автоматично синхронизира поръчките.</p>
            </div>
          </div>
          <div className="apple-step__connector"></div>
          <div className="apple-step">
            <div className="apple-step__num">2</div>
            <div className="apple-step__content">
              <h3>Въведете данните</h3>
              <p>ЕИК, адрес на фирмата и настройки за бележките. Веднъж и готово.</p>
            </div>
          </div>
          <div className="apple-step__connector"></div>
          <div className="apple-step">
            <div className="apple-step__num">3</div>
            <div className="apple-step__content">
              <h3>Готово!</h3>
              <p>Бележките се издават автоматично. Изтегляйте XML всеки месец.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="apple-pricing" id="pricing">
        <div className="apple-section__header">
          <h2 className="apple-section__title">
            Прости цени.
            <br />
            Без изненади.
          </h2>
          <p className="apple-section__subtitle">
            Изберете плана, който отговаря на бизнеса ви.
          </p>
        </div>

        <div className="apple-pricing__grid">
          <div className="apple-price-card">
            <div className="apple-price-card__header">
              <span className="apple-price-card__name">Стартов</span>
              <span className="apple-price-card__desc">За малки магазини</span>
            </div>
            <div className="apple-price-card__price">
              <span className="apple-price-card__amount">5</span>
              <span className="apple-price-card__currency">€/мес</span>
            </div>
            <ul className="apple-price-card__list">
              <li>До 50 поръчки/месец</li>
              <li>Електронни бележки</li>
              <li>Месечен XML файл</li>
              <li>Имейл поддръжка</li>
            </ul>
            <Link href="/overview" className="apple-price-card__btn">
              Започни
            </Link>
          </div>

          <div className="apple-price-card apple-price-card--featured">
            <div className="apple-price-card__badge">Популярен</div>
            <div className="apple-price-card__header">
              <span className="apple-price-card__name">Бизнес</span>
              <span className="apple-price-card__desc">За растящи бизнеси</span>
            </div>
            <div className="apple-price-card__price">
              <span className="apple-price-card__amount">15</span>
              <span className="apple-price-card__currency">€/мес</span>
            </div>
            <ul className="apple-price-card__list">
              <li>До 300 поръчки/месец</li>
              <li>Електронни бележки</li>
              <li>Месечен XML файл</li>
              <li>Приоритетна поддръжка</li>
              <li>Множество потребители</li>
            </ul>
            <Link href="/overview" className="apple-price-card__btn apple-price-card__btn--primary">
              Започни
            </Link>
          </div>

          <div className="apple-price-card">
            <div className="apple-price-card__header">
              <span className="apple-price-card__name">Корпоративен</span>
              <span className="apple-price-card__desc">За големи обеми</span>
            </div>
            <div className="apple-price-card__price">
              <span className="apple-price-card__amount apple-price-card__amount--text">По договор</span>
            </div>
            <ul className="apple-price-card__list">
              <li>Неограничени поръчки</li>
              <li>Всички функции</li>
              <li>Персонален мениджър</li>
              <li>SLA гаранция</li>
            </ul>
            <a href="#contact" className="apple-price-card__btn">
              Свържете се
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="apple-faq">
        <div className="apple-section__header">
          <h2 className="apple-section__title">Въпроси и отговори</h2>
        </div>

        <div className="apple-faq__list">
          <details className="apple-faq__item">
            <summary>
              <span>Трябва ли ми касов апарат?</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <p>Не. UDITO издава електронни касови бележки, напълно законни за онлайн търговия.</p>
          </details>
          <details className="apple-faq__item">
            <summary>
              <span>Как се свързвам с Wix?</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <p>Инсталирате UDITO от Wix App Market с няколко клика. Системата автоматично синхронизира поръчките.</p>
          </details>
          <details className="apple-faq__item">
            <summary>
              <span>Какво е месечният XML файл?</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <p>Одиторски файл по Наредба Н-18, Приложение 38. Съдържа всички продажби за периода.</p>
          </details>
          <details className="apple-faq__item">
            <summary>
              <span>Има ли безплатен пробен период?</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <p>Да, можете да тествате всички функции безплатно преди да изберете план.</p>
          </details>
        </div>
      </section>

      {/* CTA */}
      <section className="apple-cta">
        <div className="apple-cta__content">
          <h2>Готови да започнете?</h2>
          <p>Опитайте UDITO безплатно днес.</p>
          <Link href="/overview" className="apple-btn apple-btn--primary apple-btn--large">
            Започни безплатно
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="apple-footer" id="contact">
        <div className="apple-footer__inner">
          <div className="apple-footer__top">
            <div className="apple-footer__brand">
              <Image
                src="/brand/udito-logo.png"
                alt="UDITO"
                width={80}
                height={27}
              />
              <p>Електронни бележки за Wix магазини</p>
            </div>
            <div className="apple-footer__columns">
              <div className="apple-footer__col">
                <h4>Продукт</h4>
                <a href="#features">Функции</a>
                <a href="#pricing">Цени</a>
                <a href="#how">Как работи</a>
              </div>
              <div className="apple-footer__col">
                <h4>Контакт</h4>
                <a href="mailto:info@udito.bg">info@udito.bg</a>
                <a href="tel:+359888888888">+359 88 888 8888</a>
              </div>
              <div className="apple-footer__col">
                <h4>Правни</h4>
                <Link href="/privacy">Поверителност</Link>
                <Link href="/terms">Условия</Link>
              </div>
            </div>
          </div>
          <div className="apple-footer__bottom">
            <p>© 2026 UDITO. Всички права запазени.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
