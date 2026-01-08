import TokenCapture from "./overview/token-capture";

export default function Home() {
  return (
    <main>
      <TokenCapture />
      <nav className="nav">
        <span>UDITO</span>
        <div className="badges">
          <div className="badge">Wix магазини</div>
          <div className="badge">Електронни бележки</div>
          <div className="badge">НАП XML</div>
        </div>
      </nav>
      <div className="container">
        <section className="hero">
          <div>
            <h1>Електронни бележки и месечен одит XML за български онлайн магазини.</h1>
            <p>
              UDITO се свързва с Wix Stores, оформя бележки по вашия шаблон и
              подготвя XML файлове за НАП.
            </p>
            <div className="cta-row">
              <a className="cta" href="/overview">
                Отвори таблото
              </a>
              <a className="cta cta-secondary" href="/debug">
                Провери връзката
              </a>
            </div>
          </div>
          <div className="hero-card">
            <h2>Какво прави</h2>
            <p>
              Един екран за бележки, шаблони и месечни одит файлове. Лесно
              управление дори с няколко Wix сайта.
            </p>
            <div className="grid">
              <div className="card">
                <h3>Синхрон на поръчки</h3>
                <p>Слуша събитията от Wix и пази снимки на поръчките.</p>
              </div>
              <div className="card">
                <h3>Шаблони за бележки</h3>
                <p>Вмъква вашия дизайн и задължителните данни.</p>
              </div>
              <div className="card">
                <h3>Одиторски експорт</h3>
                <p>Месечен XML съгласно Н-18, Приложение 38.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
      <footer className="footer">UDITO от Designs by Po.</footer>
    </main>
  );
}
