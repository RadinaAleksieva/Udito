"use client";

import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import TokenCapture from "./overview/token-capture";

export default function Home() {
  const [scrollY, setScrollY] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeFeature, setActiveFeature] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [visibleSections, setVisibleSections] = useState<Set<string>>(new Set());
  const [countedStats, setCountedStats] = useState({ price: 0, zero: 0, percent: 0 });
  const [typedText, setTypedText] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", email: "", message: "" });
  const [formStatus, setFormStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [formError, setFormError] = useState("");

  const heroRef = useRef<HTMLElement>(null);
  const statsRef = useRef<HTMLElement>(null);
  const featuresRef = useRef<HTMLElement>(null);
  const howRef = useRef<HTMLElement>(null);
  const pricingRef = useRef<HTMLElement>(null);

  const fullText = "Автоматично.";

  // Typing effect
  useEffect(() => {
    if (!isLoaded) return;
    let i = 0;
    const interval = setInterval(() => {
      if (i <= fullText.length) {
        setTypedText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(interval);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isLoaded]);

  // Scroll handling
  useEffect(() => {
    setIsLoaded(true);

    const handleScroll = () => {
      const y = window.scrollY;
      setScrollY(y);
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? (y / docHeight) * 100 : 0);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Mouse tracking for parallax effects
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  // Intersection Observer for scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisibleSections((prev) => new Set([...prev, entry.target.id]));
          }
        });
      },
      { threshold: 0.2 }
    );

    const sections = document.querySelectorAll("[data-animate]");
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  // Counter animation for stats
  useEffect(() => {
    if (visibleSections.has("stats")) {
      const duration = 1500;
      const steps = 60;
      const interval = duration / steps;
      let step = 0;

      const timer = setInterval(() => {
        step++;
        const progress = step / steps;
        const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic

        setCountedStats({
          price: Math.round(5 * eased),
          zero: 0,
          percent: Math.round(100 * eased),
        });

        if (step >= steps) clearInterval(timer);
      }, interval);

      return () => clearInterval(timer);
    }
  }, [visibleSections]);

  // Feature cycling
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % 3);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const parallaxOffset = Math.min(scrollY * 0.3, 150);
  const heroOpacity = Math.max(1 - scrollY / 600, 0);
  const heroScale = Math.max(1 - scrollY / 3000, 0.9);

  // Contact form submission
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      setFormError("Моля, попълнете всички полета.");
      setFormStatus("error");
      return;
    }

    setFormStatus("loading");
    setFormError("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (data.ok) {
        setFormStatus("success");
        setFormData({ name: "", email: "", message: "" });
      } else {
        setFormError(data.error || "Възникна грешка. Опитайте отново.");
        setFormStatus("error");
      }
    } catch {
      setFormError("Възникна грешка при изпращането.");
      setFormStatus("error");
    }
  };

  const features = [
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
  ];

  const faqs = [
    {
      q: "Трябва ли ми касов апарат?",
      a: "Не. UDITO издава електронни касови бележки, напълно законни за онлайн търговия в България.",
    },
    {
      q: "Как се свързвам с Wix?",
      a: "Инсталирате UDITO от Wix App Market с няколко клика. Системата автоматично синхронизира поръчките ви.",
    },
    {
      q: "Какво е месечният XML файл?",
      a: "Одиторски файл по Наредба Н-18, Приложение 38. Съдържа всички продажби за периода и се подава към НАП.",
    },
    {
      q: "Има ли безплатен пробен период?",
      a: "Да, можете да тествате всички функции безплатно преди да изберете план.",
    },
  ];

  return (
    <main className="apple-landing">
      <TokenCapture />

      {/* Scroll Progress Bar */}
      <div className="scroll-progress" style={{ width: `${scrollProgress}%` }} />

      {/* Navigation */}
      <nav className={`apple-nav ${scrollY > 50 ? "apple-nav--scrolled" : ""}`}>
        <div className="apple-nav__inner">
          <Link href="/" className="apple-nav__logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/udito-logo.png"
              alt="UDITO"
              className="apple-nav__logo-img"
            />
          </Link>
          <div className="apple-nav__links">
            <a href="#features">Функции</a>
            <a href="#how">Как работи</a>
            <a href="#pricing">Цени</a>
          </div>
          <Link href="/overview" className="apple-nav__cta">
            <span>Вход</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section
        className={`apple-hero ${isLoaded ? "apple-hero--loaded" : ""}`}
        ref={heroRef}
        style={{
          opacity: heroOpacity,
          transform: `scale(${heroScale})`,
        }}
      >
        <div className="apple-hero__bg">
          <div className="apple-hero__gradient"></div>
          <div
            className="apple-hero__orb apple-hero__orb--1"
            style={{
              transform: `translate(${mousePos.x * 30}px, ${mousePos.y * 30}px)`,
            }}
          />
          <div
            className="apple-hero__orb apple-hero__orb--2"
            style={{
              transform: `translate(${mousePos.x * -20}px, ${mousePos.y * -20}px)`,
            }}
          />
          <div
            className="apple-hero__orb apple-hero__orb--3"
            style={{
              transform: `translate(${mousePos.x * 15}px, ${mousePos.y * 15}px)`,
            }}
          />
        </div>

        <div className="apple-hero__content">
          <div className="apple-hero__badge">
            <span className="badge-dot" />
            За Wix магазини в България
          </div>
          <h1 className="apple-hero__title">
            Електронни бележки.
            <br />
            <span className="gradient-text">
              {typedText}
              <span className="cursor">|</span>
            </span>
          </h1>
          <p className="apple-hero__subtitle">
            Фискална отчетност без касов апарат. Интеграция с Wix за минути.
          </p>
          <div className="apple-hero__cta">
            <Link href="/overview" className="apple-btn apple-btn--primary">
              <span>Започни безплатно</span>
              <div className="btn-shine" />
            </Link>
            <a href="#how" className="apple-btn apple-btn--secondary">
              <span>Научи повече</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            </a>
          </div>
        </div>

        {/* Floating Glass Card */}
        <div
          className="apple-hero__card"
          style={{
            transform: `translateY(${parallaxOffset}px) rotateX(${mousePos.y * 5}deg) rotateY(${mousePos.x * 5}deg)`,
          }}
        >
          <div className="glass-card">
            <div className="glass-card__glow" />
            <div className="glass-card__header">
              <div className="glass-card__dot glass-card__dot--green pulse" />
              <span>Бележка издадена</span>
              <span className="glass-card__time">сега</span>
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
                <div className="glass-card__receipt-divider" />
                <div className="glass-card__receipt-row glass-card__receipt-row--total">
                  <span>Общо</span>
                  <span>89.90 €</span>
                </div>
              </div>
            </div>
            <div className="glass-card__footer">
              <div className="checkmark">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span>Изпратена на клиента</span>
            </div>
          </div>

          {/* Floating pills with stagger animation */}
          <div className="floating-pill floating-pill--1">
            <div className="pill-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span>Синхронизирано</span>
          </div>
          <div className="floating-pill floating-pill--2">
            <div className="pill-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span>XML готов</span>
          </div>
          <div className="floating-pill floating-pill--3">
            <div className="pill-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span>НАП валиден</span>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section
        className={`apple-stats ${visibleSections.has("stats") ? "visible" : ""}`}
        id="stats"
        data-animate
        ref={statsRef}
      >
        <div className="apple-stats__inner">
          <div className="apple-stat">
            <span className="apple-stat__value">{countedStats.price}€</span>
            <span className="apple-stat__label">на месец</span>
          </div>
          <div className="apple-stat__divider" />
          <div className="apple-stat">
            <span className="apple-stat__value">{countedStats.zero}</span>
            <span className="apple-stat__label">ръчна работа</span>
          </div>
          <div className="apple-stat__divider" />
          <div className="apple-stat">
            <span className="apple-stat__value">{countedStats.percent}%</span>
            <span className="apple-stat__label">автоматизация</span>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section
        className={`apple-features ${visibleSections.has("features") ? "visible" : ""}`}
        id="features"
        data-animate
        ref={featuresRef}
      >
        <div className="apple-section__header">
          <h2 className="apple-section__title">
            Всичко, от което
            <br />
            <span className="gradient-text">се нуждаете.</span>
          </h2>
          <p className="apple-section__subtitle">
            Пълна автоматизация. Нула усилия.
          </p>
        </div>

        <div className="apple-features__grid">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className={`apple-feature-card ${activeFeature === idx ? "apple-feature-card--active" : ""}`}
              onMouseEnter={() => setActiveFeature(idx)}
              style={{
                animationDelay: `${idx * 0.15}s`,
                transform: activeFeature === idx
                  ? `scale(1.02) translateY(-8px)`
                  : 'scale(1) translateY(0)',
              }}
            >
              <div className="apple-feature-card__glow" />
              <div className="apple-feature-card__icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.desc}</p>
              <div className="apple-feature-card__arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          ))}
        </div>

        {/* Feature indicator dots */}
        <div className="feature-dots">
          {features.map((_, idx) => (
            <button
              key={idx}
              className={`feature-dot ${activeFeature === idx ? "active" : ""}`}
              onClick={() => setActiveFeature(idx)}
            />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        className={`apple-how ${visibleSections.has("how") ? "visible" : ""}`}
        id="how"
        data-animate
        ref={howRef}
      >
        <div className="apple-section__header">
          <h2 className="apple-section__title">
            Три стъпки.
            <br />
            <span className="gradient-text">Пет минути.</span>
          </h2>
        </div>

        <div className="apple-how__steps">
          {[
            {
              num: 1,
              title: "Свържете Wix магазина",
              desc: "Инсталирайте UDITO от Wix App Market. Автоматично синхронизира поръчките.",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              ),
            },
            {
              num: 2,
              title: "Въведете данните",
              desc: "ЕИК, адрес на фирмата и настройки за бележките. Веднъж и готово.",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              ),
            },
            {
              num: 3,
              title: "Готово!",
              desc: "Бележките се издават автоматично. Изтегляйте XML всеки месец.",
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
            },
          ].map((step, idx) => (
            <div key={idx} className="apple-step" style={{ animationDelay: `${idx * 0.2}s` }}>
              <div className="apple-step__icon">{step.icon}</div>
              <div className="apple-step__num">{step.num}</div>
              <div className="apple-step__content">
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
              {idx < 2 && <div className="apple-step__line" />}
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section
        className={`apple-pricing ${visibleSections.has("pricing") ? "visible" : ""}`}
        id="pricing"
        data-animate
        ref={pricingRef}
      >
        <div className="apple-section__header">
          <h2 className="apple-section__title">
            Прости цени.
            <br />
            <span className="gradient-text">Без изненади.</span>
          </h2>
          <p className="apple-section__subtitle">
            Изберете плана, който отговаря на бизнеса ви.
          </p>
        </div>

        <div className="apple-pricing__grid">
          {[
            {
              name: "Стартов",
              desc: "За малки магазини",
              price: "5",
              features: ["До 50 поръчки/месец", "Електронни бележки", "Месечен XML файл", "Имейл поддръжка"],
              featured: false,
            },
            {
              name: "Бизнес",
              desc: "За растящи бизнеси",
              price: "15",
              features: ["До 300 поръчки/месец", "Електронни бележки", "Месечен XML файл", "Приоритетна поддръжка", "Множество потребители"],
              featured: true,
            },
            {
              name: "Корпоративен",
              desc: "За големи обеми",
              price: "По договор",
              features: ["Неограничени поръчки", "Всички функции", "Персонален мениджър", "SLA гаранция"],
              featured: false,
            },
          ].map((plan, idx) => (
            <div
              key={idx}
              className={`apple-price-card ${plan.featured ? "apple-price-card--featured" : ""}`}
              style={{ animationDelay: `${idx * 0.15}s` }}
            >
              {plan.featured && <div className="apple-price-card__badge">Популярен</div>}
              <div className="apple-price-card__glow" />
              <div className="apple-price-card__header">
                <span className="apple-price-card__name">{plan.name}</span>
                <span className="apple-price-card__desc">{plan.desc}</span>
              </div>
              <div className="apple-price-card__price">
                {plan.price === "По договор" ? (
                  <span className="apple-price-card__amount apple-price-card__amount--text">{plan.price}</span>
                ) : (
                  <>
                    <span className="apple-price-card__amount">{plan.price}</span>
                    <span className="apple-price-card__currency">€/мес</span>
                  </>
                )}
              </div>
              <ul className="apple-price-card__list">
                {plan.features.map((f, i) => (
                  <li key={i}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.price === "По договор" ? "#contact" : "/overview"}
                className={`apple-price-card__btn ${plan.featured ? "apple-price-card__btn--primary" : ""}`}
              >
                <span>{plan.price === "По договор" ? "Свържете се" : "Започни"}</span>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="apple-faq" id="faq">
        <div className="apple-section__header">
          <h2 className="apple-section__title">Въпроси и отговори</h2>
        </div>

        <div className="apple-faq__list">
          {faqs.map((faq, idx) => (
            <div
              key={idx}
              className={`apple-faq__item ${openFaq === idx ? "open" : ""}`}
              onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
            >
              <div className="apple-faq__question">
                <span>{faq.q}</span>
                <div className="apple-faq__icon">
                  <span />
                  <span />
                </div>
              </div>
              <div className="apple-faq__answer">
                <p>{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Contact Form */}
      <section className="apple-contact" id="contact">
        <div className="apple-section__header">
          <h2 className="apple-section__title">
            Имате въпроси?
            <br />
            <span className="gradient-text">Свържете се с нас.</span>
          </h2>
          <p className="apple-section__subtitle">
            Ще ви отговорим в рамките на 24 часа.
          </p>
        </div>

        <div className="apple-contact__inner">
          {formStatus === "success" ? (
            <div className="apple-form-success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3>Благодарим ви!</h3>
              <p>Съобщението е изпратено успешно. Ще се свържем с вас скоро.</p>
            </div>
          ) : (
            <form className="apple-contact__form" onSubmit={handleFormSubmit}>
              {formStatus === "error" && formError && (
                <div className="apple-form-error">{formError}</div>
              )}
              <div className="apple-form-group">
                <label htmlFor="name">Име</label>
                <input
                  type="text"
                  id="name"
                  className="apple-form-input"
                  placeholder="Вашето име"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="apple-form-group">
                <label htmlFor="email">Имейл</label>
                <input
                  type="email"
                  id="email"
                  className="apple-form-input"
                  placeholder="vashiat@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="apple-form-group">
                <label htmlFor="message">Съобщение</label>
                <textarea
                  id="message"
                  className="apple-form-textarea"
                  placeholder="Как можем да ви помогнем?"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                />
              </div>
              <button
                type="submit"
                className="apple-form-submit"
                disabled={formStatus === "loading"}
              >
                {formStatus === "loading" ? "Изпращане..." : "Изпрати съобщение"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="apple-cta">
        <div className="apple-cta__bg">
          <div className="apple-cta__orb apple-cta__orb--1" />
          <div className="apple-cta__orb apple-cta__orb--2" />
        </div>
        <div className="apple-cta__content">
          <h2>Готови да започнете?</h2>
          <p>Опитайте UDITO безплатно днес.</p>
          <Link href="/overview" className="apple-btn apple-btn--primary apple-btn--large">
            <span>Започни безплатно</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="apple-footer" id="contact">
        <div className="apple-footer__inner">
          <div className="apple-footer__top">
            <div className="apple-footer__brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand/udito-logo.png"
                alt="UDITO"
                className="apple-footer__logo-img"
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
